export type ChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!';

export interface FileChange {
  path: string; // absolute fs path
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

export interface CommitInfo {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  refs: string[]; // branch/tag names pointing at this commit
}

export interface LogPage {
  commits: CommitInfo[];
  hasMore: boolean;
  nextSkip: number;
}

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

export interface StashInfo {
  index: number;
  ref: string;
  message: string;
  branch: string;
  date: string;
}

export interface BlameLine {
  sha: string;
  author: string;
  authorTime: number; // unix seconds
  summary: string;
}

export interface DiffFile {
  status: string;
  path: string;
}
