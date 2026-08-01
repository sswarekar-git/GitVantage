// Mirrored from src/git/types.ts — keep both in sync when editing.
export interface BranchInfo {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  upstreamGone?: boolean;
  lastCommitDate: string;
  lastCommitSubject: string;
}

export type BranchAction = 'checkout' | 'newBranchFrom' | 'delete' | 'rename' | 'merge' | 'rebase' | 'compare';
