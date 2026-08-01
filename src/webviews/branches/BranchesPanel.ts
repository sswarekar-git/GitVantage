import * as vscode from 'vscode';
import type { RepoManager } from '../../git/repoManager';
import * as cli from '../../git/cli';
import { getWebviewHtml } from '../htmlShell';
import { handleBranchAction } from './branchActions';
import { logError } from '../../util/logger';
import type { HostToWebviewBranchesMessage, WebviewToHostBranchesMessage } from './protocol';

let currentPanel: BranchesPanel | undefined;

export class BranchesPanel {
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(extensionUri: vscode.Uri, repoManager: RepoManager): void {
    if (currentPanel) {
      currentPanel.panel.reveal();
      currentPanel.pushState();
      currentPanel.pushRepos();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'gitpeakBranches',
      'Branches',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, localResourceRoots: [extensionUri] },
    );
    currentPanel = new BranchesPanel(panel, extensionUri, repoManager);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly repoManager: RepoManager,
  ) {
    this.panel = panel;
    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.extensionUri, 'branches');
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToHostBranchesMessage) => this.handleMessage(msg),
      undefined,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    // Same gap LogPanel had: without this, checking out/creating/deleting a
    // branch from the Commit view or a terminal while this popup is open
    // leaves it showing a stale branch list and stale ahead/behind counts.
    // cli.listBranches has no internal error handling (unlike listStashes),
    // so an uncaught failure here would be an unhandled promise rejection —
    // caught by the panel wiring test suite before this ever shipped.
    this.disposables.push(
      this.repoManager.onDidChange(() => {
        this.pushState().catch((err) => logError('refreshing branches after repo change', err));
        this.pushRepos();
      }),
    );
  }

  private post(message: HostToWebviewBranchesMessage): void {
    this.panel.webview.postMessage(message);
  }

  private async pushState(): Promise<void> {
    const repo = this.repoManager.getActiveRepository();
    if (!repo) {
      this.post({ type: 'noRepository' });
      return;
    }
    const repoRoot = repo.rootUri.fsPath;

    const branches = await cli.listBranches(repoRoot);
    const current = branches.find((b) => b.isCurrent);

    this.post({ type: 'state', payload: { branches, currentBranch: current?.name } });
  }

  private pushRepos(): void {
    const repos = this.repoManager.getRepositorySummaries();
    const activeRepoRoot = this.repoManager.getActiveRepository()?.rootUri.fsPath;
    this.post({ type: 'repos', payload: { repos, activeRepoRoot } });
  }

  private async handleMessage(msg: WebviewToHostBranchesMessage): Promise<void> {
    // Must run even with no repo — pushState() is what tells the webview
    // "there's genuinely no repository" (posts noRepository).
    if (msg.type === 'ready') {
      await this.pushState();
      this.pushRepos();
      return;
    }

    const repo = this.repoManager.getActiveRepository();
    if (!repo) return;
    const repoRoot = repo.rootUri.fsPath;

    try {
      switch (msg.type) {
        case 'branchAction':
          await handleBranchAction(
            repoRoot,
            this.repoManager.getGitApi(),
            msg.payload.name,
            msg.payload.isRemote,
            msg.payload.action,
          );
          await this.pushState();
          break;
        case 'switchRepository':
          this.repoManager.setActiveRepository(msg.payload.rootPath);
          break;
      }
    } catch (err) {
      logError(`handling branches webview message ${msg.type}`, err);
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`GitPeak: ${message}`);
      this.post({ type: 'error', payload: { message } });
    }
  }

  private dispose(): void {
    currentPanel = undefined;
    for (const d of this.disposables) d.dispose();
    this.panel.dispose();
  }
}

