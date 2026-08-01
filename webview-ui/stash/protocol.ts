// Mirrored from src/webviews/stash/protocol.ts — keep both in sync when editing.
import type { RepoSummary } from '../common/repo/types';

export type { RepoSummary };

export interface StashInfo {
  index: number;
  ref: string;
  message: string;
  branch: string;
  date: string;
}

export interface StashFile {
  status: string;
  path: string;
}

export type HostToWebviewStashMessage =
  | { type: 'state'; payload: { stashes: StashInfo[] } }
  | { type: 'stashFiles'; payload: { files: StashFile[] }; requestId: string }
  | { type: 'repos'; payload: { repos: RepoSummary[]; activeRepoRoot: string | undefined } }
  | { type: 'noRepository' }
  | { type: 'error'; payload: { message: string }; requestId?: string };

export type WebviewToHostStashMessage =
  | { type: 'ready' }
  | { type: 'createStash'; payload: { message?: string; keepIndex: boolean; includeUntracked: boolean } }
  | { type: 'stashAction'; payload: { ref: string; action: 'apply' | 'pop' | 'drop' } }
  | { type: 'requestStashFiles'; payload: { ref: string }; requestId: string }
  | { type: 'openStashFile'; payload: { ref: string; path: string } }
  | { type: 'switchRepository'; payload: { rootPath: string } };
