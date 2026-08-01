// Mirrored from src/webviews/protocol.ts — keep both in sync when editing.
import type { RepoSummary } from './repo/types';

export type { RepoSummary };

export type ChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!';

export interface FileChange {
  path: string;
  status: ChangeStatus;
  staged: boolean;
}

export interface CommitViewState {
  repoRoot: string;
  branchName: string | undefined;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
  merging: FileChange[];
  amendAvailable: boolean;
  subjectLineLimit: number;
}

export type HostToWebviewMessage =
  | { type: 'state'; payload: CommitViewState }
  | { type: 'amendMessage'; payload: { subject: string; body: string }; requestId: string }
  | { type: 'repos'; payload: { repos: RepoSummary[]; activeRepoRoot: string | undefined } }
  | { type: 'noRepository' }
  | { type: 'error'; payload: { message: string }; requestId?: string };

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'stageFiles'; payload: { paths: string[] } }
  | { type: 'unstageFiles'; payload: { paths: string[] } }
  | { type: 'openDiff'; payload: { path: string; status: ChangeStatus; staged: boolean } }
  | { type: 'openConflictFile'; payload: { path: string } }
  | { type: 'abortMerge' }
  | { type: 'requestAmendMessage'; requestId: string }
  | { type: 'commit'; payload: { subject: string; body: string; amend: boolean; push: boolean } }
  | { type: 'switchRepository'; payload: { rootPath: string } }
  | { type: 'initRepository' }
  | { type: 'cloneRepository' };
