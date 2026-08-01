// Mirrored from src/webviews/branches/protocol.ts — keep both in sync when editing.
import type { BranchAction, BranchInfo } from '../common/branches/types';
import type { RepoSummary } from '../common/repo/types';

export type { BranchAction, RepoSummary };

export interface BranchesState {
  branches: BranchInfo[];
  currentBranch: string | undefined;
}

export type HostToWebviewBranchesMessage =
  | { type: 'state'; payload: BranchesState }
  | { type: 'repos'; payload: { repos: RepoSummary[]; activeRepoRoot: string | undefined } }
  | { type: 'noRepository' }
  | { type: 'error'; payload: { message: string } };

export type WebviewToHostBranchesMessage =
  | { type: 'ready' }
  | { type: 'branchAction'; payload: { name: string; isRemote: boolean; action: BranchAction } }
  | { type: 'switchRepository'; payload: { rootPath: string } };
