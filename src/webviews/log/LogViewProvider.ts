import * as vscode from 'vscode';
import type { RepoManager } from '../../git/repoManager';
import * as cli from '../../git/cli';
import { getWebviewHtml } from '../htmlShell';
import { openCompareDiffs } from '../diffUtil';
import { handleBranchAction } from '../branches/branchActions';
import { logError } from '../../util/logger';
import type { CommitAction, HostToWebviewLogMessage, WebviewToHostLogMessage } from './protocol';

// Git's canonical empty-tree object — always present in every repo, valid as
// a diff target so a root commit's added files still show a (blank) "before".
const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export class LogViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly repoManager: RepoManager,
  ) {
    // Without this, the graph never learns HEAD moved (checkout/reset/revert/
    // cherry-pick all update refs) or that new commits/branches exist — it
    // just sits there showing stale data with no visible sign anything
    // happened, whether the change came from this view's own actions, the
    // Commit view, or an external `git` command in the terminal.
    this.repoManager.onDidChange(() => {
      this.pushInit();
      this.pushBranches().catch((err) => logError('refreshing log branches after repo change', err));
      this.pushRepos();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'log');

    webviewView.webview.onDidReceiveMessage((msg: WebviewToHostLogMessage) => this.handleMessage(msg));
    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) return;
      this.pushInit();
      this.pushBranches().catch((err) => logError('refreshing log branches after visibility change', err));
      this.pushRepos();
    });
  }

  refresh(): void {
    this.pushInit();
    this.pushBranches().catch((err) => logError('refreshing log branches', err));
    this.pushRepos();
  }

  private post(message: HostToWebviewLogMessage): void {
    this.view?.webview.postMessage(message);
  }

  private pushInit(): void {
    if (!this.view?.visible) return;
    const repo = this.repoManager.getActiveRepository();
    if (!repo) {
      this.post({ type: 'noRepository' });
      return;
    }
    const pageSize = vscode.workspace.getConfiguration('gitpeak').get<number>('log.pageSize', 200);
    this.post({ type: 'init', payload: { headSha: repo.state.HEAD?.commit, pageSize } });
  }

  private async pushBranches(): Promise<void> {
    if (!this.view?.visible) return;
    const repo = this.repoManager.getActiveRepository();
    if (!repo) return;
    const repoRoot = repo.rootUri.fsPath;

    const branches = await cli.listBranches(repoRoot);
    this.post({ type: 'branches', payload: { branches } });
  }

  private pushRepos(): void {
    if (!this.view?.visible) return;
    const repos = this.repoManager.getRepositorySummaries();
    const activeRepoRoot = this.repoManager.getActiveRepository()?.rootUri.fsPath;
    this.post({ type: 'repos', payload: { repos, activeRepoRoot } });
  }

  private async handleMessage(msg: WebviewToHostLogMessage): Promise<void> {
    // Must run even with no repo — pushInit() is what tells the webview
    // "there's genuinely no repository" (posts noRepository).
    if (msg.type === 'ready') {
      this.pushInit();
      await this.pushBranches();
      this.pushRepos();
      return;
    }

    const repo = this.repoManager.getActiveRepository();
    if (!repo) {
      const requestId = 'requestId' in msg ? msg.requestId : undefined;
      if (requestId) this.post({ type: 'error', payload: { message: 'No active Git repository.' }, requestId });
      return;
    }
    const repoRoot = repo.rootUri.fsPath;

    try {
      switch (msg.type) {
        case 'requestLogPage': {
          const { skip, limit, branchScope, filterText } = msg.payload;
          const branch = branchScope === 'current' ? 'HEAD' : undefined;
          const page = await cli.getLogPage(repoRoot, { skip, limit, branch, filterText });
          this.post({ type: 'logPage', payload: page, requestId: msg.requestId });
          break;
        }
        case 'requestCommitFiles': {
          const { sha, parentSha } = msg.payload;
          const files = await cli.diffNameStatus(repoRoot, parentSha ?? EMPTY_TREE_SHA, sha);
          this.post({ type: 'commitFiles', payload: { files }, requestId: msg.requestId });
          break;
        }
        case 'openCommitFile':
          await this.openCommitFile(
            repoRoot,
            msg.payload.sha,
            msg.payload.parentSha,
            msg.payload.path,
            msg.payload.status,
          );
          break;
        case 'commitAction':
          await this.handleCommitAction(repoRoot, msg.payload.sha, msg.payload.action);
          break;
        case 'requestBranches':
          await this.pushBranches();
          break;
        case 'branchAction':
          await handleBranchAction(
            repoRoot,
            this.repoManager.getGitApi(),
            msg.payload.name,
            msg.payload.isRemote,
            msg.payload.action,
          );
          this.pushInit();
          await this.pushBranches();
          break;
        case 'pruneRemote':
          await cli.pruneRemote(repoRoot, msg.payload.remote);
          vscode.window.showInformationMessage(`GitPeak: pruned stale branches for "${msg.payload.remote}"`);
          await this.pushBranches();
          break;
        case 'switchRepository':
          // setActiveRepository broadcasts immediately, which re-triggers
          // this provider's own onDidChange subscription — no manual re-push needed.
          this.repoManager.setActiveRepository(msg.payload.rootPath);
          break;
      }
    } catch (err) {
      logError(`handling log webview message ${msg.type}`, err);
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`GitPeak: ${message}`);
      const requestId = 'requestId' in msg ? msg.requestId : undefined;
      this.post({ type: 'error', payload: { message }, requestId });
    }
  }

  private async handleCommitAction(repoRoot: string, sha: string, action: CommitAction): Promise<void> {
    switch (action) {
      case 'checkout':
        await cli.checkoutBranch(repoRoot, sha);
        vscode.window.showInformationMessage(`GitPeak: checked out ${sha.slice(0, 8)} (detached HEAD)`);
        break;
      case 'cherryPick': {
        if (await cli.cherryPickInProgress(repoRoot)) {
          const choice = await vscode.window.showWarningMessage(
            'A previous cherry-pick was left unresolved (conflict or empty commit). It must be aborted before starting a new one.',
            { modal: true },
            'Abort Previous & Cherry-Pick',
          );
          if (choice !== 'Abort Previous & Cherry-Pick') return;
          await cli.abortCherryPick(repoRoot);
        }
        await cli.cherryPick(repoRoot, sha);
        vscode.window.showInformationMessage(`GitPeak: cherry-picked ${sha.slice(0, 8)}`);
        break;
      }
      case 'revert':
        await cli.revertCommit(repoRoot, sha);
        vscode.window.showInformationMessage(`GitPeak: reverted ${sha.slice(0, 8)}`);
        break;
      case 'createBranch': {
        const name = await vscode.window.showInputBox({ prompt: `New branch name from ${sha.slice(0, 8)}` });
        if (!name) return;
        await cli.createBranch(repoRoot, name, sha);
        vscode.window.showInformationMessage(`GitPeak: created branch ${name}`);
        break;
      }
      case 'resetSoft': {
        const confirm = await vscode.window.showWarningMessage(
          `Reset current branch to ${sha.slice(0, 8)}? Working tree and index are kept, but later commits will no longer be reachable from this branch.`,
          { modal: true },
          'Reset (Soft)',
        );
        if (confirm !== 'Reset (Soft)') return;
        await cli.resetTo(repoRoot, sha, 'soft');
        break;
      }
      case 'resetHard': {
        const confirm = await vscode.window.showWarningMessage(
          `Hard reset current branch to ${sha.slice(0, 8)}? This discards all uncommitted changes and any commits after this point. This cannot be undone easily.`,
          { modal: true },
          'Reset (Hard)',
        );
        if (confirm !== 'Reset (Hard)') return;
        await cli.resetTo(repoRoot, sha, 'hard');
        break;
      }
      case 'compareHead': {
        const api = this.repoManager.getGitApi();
        if (api) await openCompareDiffs(api, repoRoot, sha, 'HEAD');
        break;
      }
      case 'compareWorkingTree': {
        const api = this.repoManager.getGitApi();
        if (api) await openCompareDiffs(api, repoRoot, sha, undefined);
        break;
      }
    }
  }

  private async openCommitFile(
    repoRoot: string,
    sha: string,
    parentSha: string | undefined,
    path: string,
    status: string,
  ): Promise<void> {
    const api = this.repoManager.getGitApi();
    if (!api) return;
    const uri = vscode.Uri.joinPath(vscode.Uri.file(repoRoot), path);

    // A newly-added file has no content in the parent tree, and a deleted file
    // has none in the target commit — diffing against that side throws
    // "Unable to resolve nonexistent file" from vscode.git's content provider.
    // Open the single side that actually exists instead of diffing.
    if (status.startsWith('A')) {
      await vscode.commands.executeCommand('vscode.open', api.toGitUri(uri, sha));
      return;
    }
    if (status.startsWith('D')) {
      await vscode.commands.executeCommand('vscode.open', api.toGitUri(uri, parentSha ?? EMPTY_TREE_SHA));
      return;
    }

    const leftUri = api.toGitUri(uri, parentSha ?? EMPTY_TREE_SHA);
    const rightUri = api.toGitUri(uri, sha);
    const title = `${path} (${sha.slice(0, 8)})`;
    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
  }
}
