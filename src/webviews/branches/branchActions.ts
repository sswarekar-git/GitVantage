import * as vscode from 'vscode';
import * as cli from '../../git/cli';
import { openCompareDiffs } from '../diffUtil';
import type { GitAPI } from '../../git/vscodeGitTypes';
import type { BranchAction } from '../../git/types';

// Shared by BranchesPanel (popup) and LogViewProvider's inline branches
// column so both surfaces dispatch branch actions identically.
export async function handleBranchAction(
  repoRoot: string,
  api: GitAPI | undefined,
  name: string,
  isRemote: boolean,
  action: BranchAction,
): Promise<void> {
  switch (action) {
    case 'checkout':
      if (isRemote) {
        await cli.checkoutRemoteTracking(repoRoot, name);
      } else {
        await cli.checkoutBranch(repoRoot, name);
      }
      break;
    case 'newBranchFrom': {
      const newName = await vscode.window.showInputBox({ prompt: `New branch name from ${name}` });
      if (!newName) return;
      await cli.createBranch(repoRoot, newName, name);
      break;
    }
    case 'delete': {
      if (isRemote) {
        const remote = name.slice(0, name.indexOf('/'));
        const branchName = name.slice(remote.length + 1);
        const confirm = await vscode.window.showWarningMessage(
          `Delete branch "${branchName}" from remote "${remote}"? This deletes it for everyone, not just locally.`,
          { modal: true },
          'Delete on Remote',
        );
        if (confirm !== 'Delete on Remote') return;
        await cli.deleteRemoteBranch(repoRoot, remote, branchName);
        return;
      }
      const merged = await cli.isBranchMerged(repoRoot, name);
      if (!merged) {
        const confirm = await vscode.window.showWarningMessage(
          `Branch "${name}" is not fully merged. Delete it anyway?`,
          { modal: true },
          'Delete',
        );
        if (confirm !== 'Delete') return;
        await cli.deleteBranch(repoRoot, name, true);
      } else {
        await cli.deleteBranch(repoRoot, name, false);
      }
      break;
    }
    case 'rename': {
      if (isRemote) return;
      const newName = await vscode.window.showInputBox({ prompt: `Rename branch "${name}" to`, value: name });
      if (!newName || newName === name) return;
      await cli.renameBranch(repoRoot, name, newName);
      break;
    }
    case 'merge': {
      const confirm = await vscode.window.showInformationMessage(`Merge "${name}" into current branch?`, 'Merge');
      if (confirm !== 'Merge') return;
      await cli.mergeBranch(repoRoot, name);
      break;
    }
    case 'rebase': {
      const confirm = await vscode.window.showWarningMessage(
        `Rebase current branch onto "${name}"? This rewrites local commit history.`,
        { modal: true },
        'Rebase',
      );
      if (confirm !== 'Rebase') return;
      await cli.rebaseOnto(repoRoot, name);
      break;
    }
    case 'compare': {
      if (api) await openCompareDiffs(api, repoRoot, name, 'HEAD');
      break;
    }
  }
}
