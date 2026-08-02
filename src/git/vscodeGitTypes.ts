// Minimal hand-written subset of the built-in vscode.git extension's public API.
// vscode.git ships no public .d.ts in @types, so this trims the well-known
// microsoft/vscode extensions/git/src/api/git.d.ts sample down to what GitVantage uses.
import * as vscode from 'vscode';

export const enum Status {
  INDEX_MODIFIED,
  INDEX_ADDED,
  INDEX_DELETED,
  INDEX_RENAMED,
  INDEX_COPIED,
  MODIFIED,
  DELETED,
  UNTRACKED,
  IGNORED,
  INTENT_TO_ADD,
  INTENT_TO_RENAME,
  TYPE_CHANGED,
  ADDED_BY_US,
  ADDED_BY_THEM,
  DELETED_BY_US,
  DELETED_BY_THEM,
  BOTH_ADDED,
  BOTH_DELETED,
  BOTH_MODIFIED,
}

export interface GitChange {
  readonly uri: vscode.Uri;
  readonly originalUri: vscode.Uri;
  readonly renameUri: vscode.Uri | undefined;
  readonly status: Status;
}

export interface Branch {
  readonly type: number;
  readonly name?: string;
  readonly commit?: string;
  readonly upstream?: { readonly name: string; readonly remote: string };
  readonly ahead?: number;
  readonly behind?: number;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly workingTreeChanges: GitChange[];
  readonly indexChanges: GitChange[];
  readonly mergeChanges: GitChange[];
  readonly onDidChange: vscode.Event<void>;
}

export interface CommitOptions {
  all?: boolean;
  amend?: boolean;
}

export interface Repository {
  readonly rootUri: vscode.Uri;
  readonly state: RepositoryState;
  add(paths: vscode.Uri[]): Promise<void>;
  revert(paths: vscode.Uri[]): Promise<void>;
  commit(message: string, opts?: CommitOptions): Promise<void>;
  push(remoteName?: string, branchName?: string, setUpstream?: boolean): Promise<void>;
  // Forces the built-in git extension to re-scan and refresh repo.state.
  // Needed after any mutation made through our own CLI layer (see cli.ts),
  // since those bypass the built-in extension entirely — without this,
  // repo.state.indexChanges/workingTreeChanges stay stale until the
  // extension's own background watcher happens to catch up.
  status(): Promise<void>;
}

export interface GitAPI {
  readonly repositories: Repository[];
  readonly onDidOpenRepository: vscode.Event<Repository>;
  readonly onDidCloseRepository: vscode.Event<Repository>;
  readonly git: { readonly path: string };
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}

export interface GitExtension {
  getAPI(version: 1): GitAPI;
}
