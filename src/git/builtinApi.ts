import * as vscode from 'vscode';
import type { GitAPI, GitExtension, Repository, GitChange } from './vscodeGitTypes';
import { Status } from './vscodeGitTypes';
import type { FileChange, ChangeStatus } from './types';

export async function getBuiltinGitApi(): Promise<GitAPI> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) {
    throw new Error('vscode.git extension not found');
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  return ext.exports.getAPI(1);
}

function statusToChangeStatus(status: Status): ChangeStatus {
  switch (status) {
    case Status.INDEX_ADDED:
    case Status.INTENT_TO_ADD:
      return 'A';
    case Status.INDEX_DELETED:
    case Status.DELETED:
      return 'D';
    case Status.INDEX_RENAMED:
    case Status.INTENT_TO_RENAME:
      return 'R';
    case Status.INDEX_COPIED:
      return 'C';
    case Status.UNTRACKED:
      return '?';
    default:
      return 'M';
  }
}

function toFileChange(change: GitChange, staged: boolean): FileChange {
  return {
    path: change.uri.fsPath,
    status: statusToChangeStatus(change.status),
    staged,
  };
}

export function getStagedChanges(repo: Repository): FileChange[] {
  return repo.state.indexChanges.map((c) => toFileChange(c, true));
}

export function getUnstagedChanges(repo: Repository): FileChange[] {
  return repo.state.workingTreeChanges
    .filter((c) => c.status !== Status.UNTRACKED)
    .map((c) => toFileChange(c, false));
}

export function getUntrackedChanges(repo: Repository): FileChange[] {
  return repo.state.workingTreeChanges
    .filter((c) => c.status === Status.UNTRACKED)
    .map((c) => toFileChange(c, false));
}

export function getMergeChanges(repo: Repository): FileChange[] {
  return repo.state.mergeChanges.map((c) => ({ path: c.uri.fsPath, status: '!' as const, staged: false }));
}

export function getCurrentBranchName(repo: Repository): string | undefined {
  return repo.state.HEAD?.name;
}

export function onDidChangeRepoState(repo: Repository, cb: () => void): vscode.Disposable {
  return repo.state.onDidChange(cb);
}
