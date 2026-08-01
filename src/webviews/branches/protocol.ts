// Mirrored in webview-ui/branches/protocol.ts — keep both in sync when editing.
import type { BranchAction, BranchInfo } from '../../git/types';
import type { RepoSummary } from '../../git/repoManager';

export type { BranchAction };

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
