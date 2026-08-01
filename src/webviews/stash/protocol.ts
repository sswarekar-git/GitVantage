// Mirrored in webview-ui/stash/protocol.ts — keep both in sync when editing.
import type { StashInfo } from '../../git/types';
import type { RepoSummary } from '../../git/repoManager';

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
