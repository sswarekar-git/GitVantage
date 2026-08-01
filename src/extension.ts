import * as vscode from 'vscode';
import * as cli from './git/cli';
import { RepoManager } from './git/repoManager';
import { STASH_SCHEME, StashContentProvider } from './git/stashContentProvider';
import { CommitViewProvider } from './webviews/commit/CommitViewProvider';
import { StashViewProvider } from './webviews/stash/StashViewProvider';
import { LogViewProvider } from './webviews/log/LogViewProvider';
import { BranchesPanel } from './webviews/branches/BranchesPanel';
import { createBranchStatusBarItem } from './statusBar/branchStatusBarItem';
import { createRepoStatusBarItem } from './statusBar/repoStatusBarItem';
import { BlameController } from './blame/BlameController';
import { LocalHistoryStore } from './localHistory/store';
import { LOCAL_HISTORY_SCHEME, LocalHistoryContentProvider } from './localHistory/contentProvider';
import { registerLocalHistoryCommand } from './localHistory/commands';
import { initLogger, log, logError } from './util/logger';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = initLogger();
  context.subscriptions.push(output);

  const repoManager = new RepoManager();
  context.subscriptions.push(repoManager);

  try {
    await repoManager.activate();
  } catch (err) {
    logError('activating repo manager', err);
    vscode.window.showErrorMessage('GitVantage: failed to connect to the built-in Git extension.');
    return;
  }

  const commitViewProvider = new CommitViewProvider(context.extensionUri, repoManager);
  const stashViewProvider = new StashViewProvider(context.extensionUri, repoManager);
  const logViewProvider = new LogViewProvider(context.extensionUri, repoManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('gitvantage.commit', commitViewProvider),
    vscode.window.registerWebviewViewProvider('gitvantage.stash', stashViewProvider),
    vscode.window.registerWebviewViewProvider('gitvantage.log', logViewProvider),
    vscode.workspace.registerTextDocumentContentProvider(STASH_SCHEME, new StashContentProvider()),
  );

  context.subscriptions.push(createBranchStatusBarItem(repoManager), createRepoStatusBarItem(repoManager));

  const blameController = new BlameController(repoManager);
  context.subscriptions.push(blameController);

  const storageRoot = context.storageUri ?? context.globalStorageUri;
  const localHistoryStore = new LocalHistoryStore(storageRoot);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      LOCAL_HISTORY_SCHEME,
      new LocalHistoryContentProvider(localHistoryStore),
    ),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.scheme !== 'file') return;
      localHistoryStore.recordSnapshot(doc.uri, doc.getText()).catch((err) => logError('recording local history snapshot', err));
    }),
  );
  registerLocalHistoryCommand(context, localHistoryStore);

  context.subscriptions.push(
    vscode.commands.registerCommand('gitvantage.refreshAll', () => {
      commitViewProvider.refresh();
      stashViewProvider.refresh();
      logViewProvider.refresh();
    }),
    vscode.commands.registerCommand('gitvantage.openLog', () => {
      vscode.commands.executeCommand('gitvantage.log.focus');
    }),
    vscode.commands.registerCommand('gitvantage.showBranchesPopup', () => {
      BranchesPanel.createOrShow(context.extensionUri, repoManager);
    }),
    vscode.commands.registerCommand('gitvantage.toggleBlame', () => blameController.toggle()),
    vscode.commands.registerCommand('gitvantage.switchRepository', async () => {
      const active = repoManager.getActiveRepository();
      const items = repoManager.getRepositorySummaries().map((r) => ({
        label: r.rootPath === active?.rootUri.fsPath ? `$(check) ${r.name}` : r.name,
        description: r.rootPath,
        rootPath: r.rootPath,
      }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a repository' });
      if (picked) repoManager.setActiveRepository(picked.rootPath);
    }),
    vscode.commands.registerCommand('gitvantage.fetch', async () => {
      const repo = repoManager.getActiveRepository();
      if (!repo) return;
      try {
        await cli.fetchAll(repo.rootUri.fsPath);
        vscode.window.showInformationMessage('GitVantage: fetch complete');
      } catch (err) {
        logError('fetching', err);
        vscode.window.showErrorMessage(`GitVantage: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        commitViewProvider.refresh();
        logViewProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('gitvantage.pull', async () => {
      const repo = repoManager.getActiveRepository();
      if (!repo) return;
      try {
        await cli.pull(repo.rootUri.fsPath);
        vscode.window.showInformationMessage('GitVantage: pull complete');
      } catch (err) {
        logError('pulling', err);
        vscode.window.showErrorMessage(`GitVantage: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        commitViewProvider.refresh();
        logViewProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('gitvantage.push', async () => {
      const repo = repoManager.getActiveRepository();
      if (!repo) return;
      try {
        await cli.pushCurrent(repo.rootUri.fsPath);
        vscode.window.showInformationMessage('GitVantage: push complete');
      } catch (err) {
        logError('pushing', err);
        vscode.window.showErrorMessage(`GitVantage: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        commitViewProvider.refresh();
        logViewProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('gitvantage.addRemote', async () => {
      const repo = repoManager.getActiveRepository();
      if (!repo) {
        vscode.window.showErrorMessage('GitVantage: no active Git repository.');
        return;
      }
      const repoRoot = repo.rootUri.fsPath;
      const existing = await cli.listRemotes(repoRoot);

      const name = await vscode.window.showInputBox({
        prompt: 'Remote name',
        value: 'origin',
        validateInput: (value) => {
          if (!value.trim()) return 'Remote name cannot be empty.';
          if (existing.includes(value.trim())) return `Remote "${value.trim()}" already exists.`;
          return undefined;
        },
      });
      if (!name) return;

      const url = await vscode.window.showInputBox({
        prompt: `URL for remote "${name.trim()}"`,
        placeHolder: 'https://github.com/user/repo.git',
        validateInput: (value) => (value.trim() ? undefined : 'Remote URL cannot be empty.'),
      });
      if (!url) return;

      try {
        await cli.addRemote(repoRoot, name.trim(), url.trim());
        vscode.window.showInformationMessage(`GitVantage: added remote "${name.trim()}"`);
      } catch (err) {
        logError('adding remote', err);
        vscode.window.showErrorMessage(`GitVantage: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        commitViewProvider.refresh();
        logViewProvider.refresh();
      }
    }),
    vscode.commands.registerCommand('gitvantage.pruneRemotes', async () => {
      const repo = repoManager.getActiveRepository();
      if (!repo) return;
      const repoRoot = repo.rootUri.fsPath;
      try {
        const remotes = await cli.listRemotes(repoRoot);
        for (const remote of remotes) {
          await cli.pruneRemote(repoRoot, remote);
        }
        vscode.window.showInformationMessage(`GitVantage: pruned ${remotes.length} remote(s)`);
      } catch (err) {
        logError('pruning remotes', err);
        vscode.window.showErrorMessage(`GitVantage: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        logViewProvider.refresh();
      }
    }),
  );

  log('GitVantage activated');
}

export function deactivate(): void {
  // Disposables registered via context.subscriptions handle cleanup.
}
