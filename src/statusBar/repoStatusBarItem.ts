import * as vscode from 'vscode';
import { toRepoSummary, type RepoManager } from '../git/repoManager';

// Only relevant once there's more than one repo in the workspace — hidden
// entirely otherwise, so single-repo workspaces see no new status bar noise.
export function createRepoStatusBarItem(repoManager: RepoManager): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
  item.command = 'gitvantage.switchRepository';
  item.tooltip = 'GitVantage: Switch Repository';

  const update = () => {
    const summaries = repoManager.getRepositorySummaries();
    const repo = repoManager.getActiveRepository();
    if (summaries.length <= 1 || !repo) {
      item.hide();
      return;
    }
    item.text = `$(repo) ${toRepoSummary(repo).name}`;
    item.show();
  };

  repoManager.onDidChange(update);
  update();

  return item;
}
