import * as vscode from 'vscode';
import type { RepoManager } from '../../git/repoManager';
import * as cli from '../../git/cli';
import { stashFileUri } from '../../git/stashContentProvider';
import { getWebviewHtml } from '../htmlShell';
import { logError } from '../../util/logger';
import type { HostToWebviewStashMessage, WebviewToHostStashMessage } from './protocol';

export class StashViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly repoManager: RepoManager,
  ) {
    this.repoManager.onDidChange(() => {
      this.pushState().catch((err) => logError('refreshing stash view after repo change', err));
      this.pushRepos();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'stash');

    webviewView.webview.onDidReceiveMessage((msg: WebviewToHostStashMessage) => this.handleMessage(msg));
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

  private post(message: HostToWebviewStashMessage): void {
    this.view?.webview.postMessage(message);
  }

  private async pushState(): Promise<void> {
    if (!this.view?.visible) return;
    const repo = this.repoManager.getActiveRepository();
    if (!repo) {
      this.post({ type: 'noRepository' });
      return;
    }
    const stashes = await cli.listStashes(repo.rootUri.fsPath);
    this.post({ type: 'state', payload: { stashes } });
  }

  private pushRepos(): void {
    if (!this.view?.visible) return;
    const repos = this.repoManager.getRepositorySummaries();
    const activeRepoRoot = this.repoManager.getActiveRepository()?.rootUri.fsPath;
    this.post({ type: 'repos', payload: { repos, activeRepoRoot } });
  }

  private async handleMessage(msg: WebviewToHostStashMessage): Promise<void> {
    // Must run even with no repo — it's what tells the webview "there's
    // genuinely no repository" (pushState posts noRepository).
    if (msg.type === 'ready') {
      await this.pushState();
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
        case 'createStash':
          await cli.createStash(repoRoot, msg.payload);
          await this.pushState();
          break;
        case 'stashAction':
          await this.handleStashAction(repoRoot, msg.payload.ref, msg.payload.action);
          await this.pushState();
          break;
        case 'requestStashFiles': {
          const files = await cli.getStashFiles(repoRoot, msg.payload.ref);
          this.post({ type: 'stashFiles', payload: { files }, requestId: msg.requestId });
          break;
        }
        case 'openStashFile':
          await this.openStashFile(repoRoot, msg.payload.ref, msg.payload.path);
          break;
        case 'switchRepository':
          this.repoManager.setActiveRepository(msg.payload.rootPath);
          break;
      }
    } catch (err) {
      logError(`handling stash webview message ${msg.type}`, err);
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`GitVantage: ${message}`);
      const requestId = 'requestId' in msg ? msg.requestId : undefined;
      this.post({ type: 'error', payload: { message }, requestId });
    }
  }

  private async handleStashAction(repoRoot: string, ref: string, action: 'apply' | 'pop' | 'drop'): Promise<void> {
    if (action === 'apply') {
      await cli.applyStash(repoRoot, ref);
    } else if (action === 'pop') {
      await cli.popStash(repoRoot, ref);
    } else {
      const confirm = await vscode.window.showWarningMessage(
        `Drop stash "${ref}"? This cannot be undone.`,
        { modal: true },
        'Drop',
      );
      if (confirm !== 'Drop') return;
      await cli.dropStash(repoRoot, ref);
    }
  }

  private async openStashFile(repoRoot: string, ref: string, path: string): Promise<void> {
    const workingUri = vscode.Uri.joinPath(vscode.Uri.file(repoRoot), path);
    const stashUri = stashFileUri(repoRoot, ref, path);
    await vscode.commands.executeCommand('vscode.diff', workingUri, stashUri, `${path} (Working Tree ↔ ${ref})`);
  }
}
