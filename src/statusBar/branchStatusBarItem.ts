import * as vscode from 'vscode';
import { toRepoSummary, type RepoManager } from '../git/repoManager';
import { getCurrentBranchName } from '../git/builtinApi';

export function createBranchStatusBarItem(repoManager: RepoManager): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'gitvantage.showBranchesPopup';

  const update = () => {
    const repo = repoManager.getActiveRepository();
    if (!repo) {
      item.hide();
      return;
    }
    const branch = getCurrentBranchName(repo);
    const branchText = `$(git-branch) ${branch ?? 'detached HEAD'}`;
    const multiRepo = repoManager.getRepositorySummaries().length > 1;
    item.text = multiRepo ? `$(repo) ${toRepoSummary(repo).name}  ${branchText}` : branchText;
    item.tooltip = 'GitVantage: Branches…';
    item.show();
  };

  repoManager.onDidChange(update);
  update();

  return item;
}
