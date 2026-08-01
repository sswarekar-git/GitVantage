// Mirrored in webview-ui/common/protocol.ts. Keep both in sync when editing —
// the extension-host (Node) and webview (browser) tsconfigs can't share a module
// directly, so this file is intentionally duplicated rather than project-referenced.
import type { CommitViewState, ChangeStatus } from '../git/types';
import type { RepoSummary } from '../git/repoManager';

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
