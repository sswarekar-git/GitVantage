// Mirrored from src/webviews/log/protocol.ts — keep both in sync when editing.
import type { BranchAction, BranchInfo } from '../common/branches/types';
import type { RepoSummary } from '../common/repo/types';

export type { BranchAction, BranchInfo, RepoSummary };

export type ChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?';

export interface CommitInfo {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  refs: string[];
}

export interface LogPage {
  commits: CommitInfo[];
  hasMore: boolean;
  nextSkip: number;
}

export interface DiffFile {
  status: string;
  path: string;
}

export type CommitAction =
  | 'checkout'
  | 'cherryPick'
  | 'revert'
  | 'createBranch'
  | 'resetSoft'
  | 'resetHard'
  | 'compareHead'
  | 'compareWorkingTree';

export type HostToWebviewLogMessage =
  | { type: 'init'; payload: { headSha: string | undefined; pageSize: number } }
  | { type: 'logPage'; payload: LogPage; requestId: string }
  | { type: 'commitFiles'; payload: { files: DiffFile[] }; requestId: string }
  | { type: 'branches'; payload: { branches: BranchInfo[] } }
  | { type: 'repos'; payload: { repos: RepoSummary[]; activeRepoRoot: string | undefined } }
  | { type: 'noRepository' }
  | { type: 'error'; payload: { message: string }; requestId?: string };

export type WebviewToHostLogMessage =
  | { type: 'ready' }
  | {
      type: 'requestLogPage';
      payload: { skip: number; limit: number; branchScope: 'all' | 'current'; filterText?: string };
      requestId: string;
    }
  | { type: 'requestCommitFiles'; payload: { sha: string; parentSha: string | undefined }; requestId: string }
  | {
      type: 'openCommitFile';
      payload: { sha: string; parentSha: string | undefined; path: string; status: string };
    }
  | { type: 'commitAction'; payload: { sha: string; action: CommitAction } }
  | { type: 'requestBranches' }
  | { type: 'branchAction'; payload: { name: string; isRemote: boolean; action: BranchAction } }
  | { type: 'pruneRemote'; payload: { remote: string } }
  | { type: 'switchRepository'; payload: { rootPath: string } };
