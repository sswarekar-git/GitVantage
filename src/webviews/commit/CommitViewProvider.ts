import * as vscode from 'vscode';
import type { Repository } from '../../git/vscodeGitTypes';
import * as builtinApi from '../../git/builtinApi';
import { abortMerge, commitChanges, getHeadCommitMessage, pushCurrent, stageFiles, unstageFiles } from '../../git/cli';
import type { RepoManager } from '../../git/repoManager';
import type { CommitViewState, ChangeStatus } from '../../git/types';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../protocol';
import { getWebviewHtml } from '../htmlShell';
import { logError } from '../../util/logger';

export class CommitViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly repoManager: RepoManager,
  ) {
    this.repoManager.onDidChange(() => {
      this.pushState().catch((err) => logError('refreshing commit view after repo change', err));
      this.pushRepos();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'commit');

    webviewView.webview.onDidReceiveMessage((msg: WebviewToHostMessage) => this.handleMessage(msg));
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.pushState();
        this.pushRepos();
      }
    });
  }

  refresh(): void {
    this.pushState();
    this.pushRepos();
  }

  private pushRepos(): void {
    if (!this.view?.visible) return;
    const repos = this.repoManager.getRepositorySummaries();
    const activeRepoRoot = this.getRepo()?.rootUri.fsPath;
    this.post({ type: 'repos', payload: { repos, activeRepoRoot } });
  }

  private getRepo(): Repository | undefined {
    return this.repoManager.getActiveRepository();
  }

  private post(message: HostToWebviewMessage): void {
    this.view?.webview.postMessage(message);
  }

  private async pushState(): Promise<void> {
    const repo = this.getRepo();
    if (!repo) {
      this.updateBadge(0);
      if (!this.view?.visible) return;
      this.post({ type: 'noRepository' });
      return;
    }

    const staged = builtinApi.getStagedChanges(repo);
    const unstaged = builtinApi.getUnstagedChanges(repo);
    const untracked = builtinApi.getUntrackedChanges(repo);
    const merging = builtinApi.getMergeChanges(repo);
    this.updateBadge(staged.length + unstaged.length + untracked.length + merging.length);

    if (!this.view?.visible) return;

    const state: CommitViewState = {
      repoRoot: repo.rootUri.fsPath,
      branchName: builtinApi.getCurrentBranchName(repo),
      staged,
      unstaged,
      untracked,
      merging,
      amendAvailable: true,
      subjectLineLimit: vscode.workspace.getConfiguration('gitvantage').get<number>('commit.subjectLineLimit', 72),
    };
    this.post({ type: 'state', payload: state });
  }

  // The activity bar badge is chrome on the view container, not webview
  // content — it must stay live even while the panel is collapsed, unlike
  // the postMessage state push above which only makes sense when rendered.
  private updateBadge(count: number): void {
    if (!this.view) return;
    this.view.badge =
      count > 0 ? { value: count, tooltip: `${count} changed file${count === 1 ? '' : 's'}` } : undefined;
  }

  private async handleMessage(msg: WebviewToHostMessage): Promise<void> {
    // These two are exactly what you use to fix the "no repository" case, so
    // they must run before (not gated behind) the no-repo bail-out below.
    if (msg.type === 'initRepository' || msg.type === 'cloneRepository') {
      try {
        await vscode.commands.executeCommand(msg.type === 'initRepository' ? 'git.init' : 'git.clone');
      } catch (err) {
        logError(`handling ${msg.type}`, err);
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`GitVantage: ${message}`);
      }
      return;
    }

    // Must run even with no repo — it's what tells the webview "there's
    // genuinely no repository" (pushState posts noRepository) rather than
    // leaving it stuck with no response at all.
    if (msg.type === 'ready') {
      await this.pushState();
      this.pushRepos();
      return;
    }

    const repo = this.getRepo();
    if (!repo) {
      const requestId = 'requestId' in msg ? msg.requestId : undefined;
      if (requestId) this.post({ type: 'error', payload: { message: 'No active Git repository.' }, requestId });
      return;
    }

    try {
      switch (msg.type) {
        case 'stageFiles':
          await stageFiles(repo.rootUri.fsPath, msg.payload.paths);
          await this.pushState();
          break;
        case 'unstageFiles':
          await unstageFiles(repo.rootUri.fsPath, msg.payload.paths);
          await this.pushState();
          break;
        case 'openDiff':
          await this.openDiff(msg.payload.path, msg.payload.status, msg.payload.staged);
          break;
        case 'openConflictFile':
          await vscode.window.showTextDocument(vscode.Uri.file(msg.payload.path));
          break;
        case 'abortMerge': {
          const confirm = await vscode.window.showWarningMessage(
            'Abort merge? This discards the in-progress merge and restores the pre-merge state.',
            { modal: true },
            'Abort Merge',
          );
          if (confirm !== 'Abort Merge') break;
          await abortMerge(repo.rootUri.fsPath);
          await this.pushState();
          break;
        }
        case 'requestAmendMessage': {
          const full = await getHeadCommitMessage(repo.rootUri.fsPath);
          const [subject, ...rest] = full.split('\n\n');
          this.post({
            type: 'amendMessage',
            payload: { subject: subject ?? '', body: rest.join('\n\n') },
            requestId: msg.requestId,
          });
          break;
        }
        case 'commit': {
          const { subject, body, amend, push } = msg.payload;
          const fullMessage = body.trim() ? `${subject}\n\n${body}` : subject;
          await commitChanges(repo.rootUri.fsPath, fullMessage, { amend });
          if (push) await pushCurrent(repo.rootUri.fsPath);
          await this.pushState();
          break;
        }
        case 'switchRepository':
          // Immediate broadcast from setActiveRepository re-triggers this
          // provider's own onDidChange subscription — no manual re-push needed.
          this.repoManager.setActiveRepository(msg.payload.rootPath);
          break;
      }
    } catch (err) {
      logError(`handling webview message ${msg.type}`, err);
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`GitVantage: ${message}`);
      const requestId = 'requestId' in msg ? msg.requestId : undefined;
      this.post({ type: 'error', payload: { message }, requestId });
    }
  }

  private async openDiff(path: string, status: ChangeStatus, staged: boolean): Promise<void> {
    const uri = vscode.Uri.file(path);
    const api = this.repoManager.getGitApi();

    if (status === '?' || !api) {
      await vscode.window.showTextDocument(uri);
      return;
    }

    const headUri = api.toGitUri(uri, 'HEAD');
    const rightUri = staged ? api.toGitUri(uri, '') : uri;
    const title = `${uri.path.split('/').pop()} (${staged ? 'Staged' : 'Working Tree'})`;
    await vscode.commands.executeCommand('vscode.diff', headUri, rightUri, title);
  }
}
