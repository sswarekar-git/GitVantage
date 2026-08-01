import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  CommitViewState,
  FileChange,
  HostToWebviewMessage,
  RepoSummary,
  WebviewToHostMessage,
} from '../common/protocol';
import { createMessageBus } from '../common/messageBus';
import { ChangesTree } from './ChangesTree';
import { CommitMessageBox } from './CommitMessageBox';
import { RepoSelect } from '../common/repo/RepoSelect';

const bus = createMessageBus<HostToWebviewMessage, WebviewToHostMessage>();
bus.init();

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `req-${requestCounter}`;
}

interface LastAttempt {
  subject: string;
  body: string;
  amend: boolean;
}

// Overlays optimistic stage/unstage intent on top of the last state received
// from the host. Without this, the checkbox a user just clicked visually
// reverts for as long as it takes VSCode's built-in Git extension to rescan
// and report back (its own internal debounce, on top of ours) — a click
// looks like it "didn't take" even though the git operation is in flight.
function applyPendingOverrides(state: CommitViewState, pending: Map<string, boolean>) {
  const all = [...state.merging, ...state.staged, ...state.unstaged, ...state.untracked];
  const merging: FileChange[] = [];
  const staged: FileChange[] = [];
  const unstaged: FileChange[] = [];
  const untracked: FileChange[] = [];

  for (const file of all) {
    const effectiveStaged = pending.has(file.path) ? pending.get(file.path)! : file.staged;
    const displayFile: FileChange = { ...file, staged: effectiveStaged };
    if (effectiveStaged) {
      staged.push(displayFile);
    } else if (file.status === '!') {
      merging.push(displayFile);
    } else if (file.status === '?') {
      untracked.push(displayFile);
    } else {
      unstaged.push(displayFile);
    }
  }
  return { merging, staged, unstaged, untracked };
}

export function App() {
  const [state, setState] = useState<CommitViewState | undefined>(undefined);
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [amend, setAmend] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [activeRepoRoot, setActiveRepoRoot] = useState<string | undefined>(undefined);
  const [noRepository, setNoRepository] = useState(false);
  const lastAttempt = useRef<LastAttempt | null>(null);

  useEffect(() => {
    const unsubscribe = bus.onMessage((msg) => {
      if (msg.type === 'state') {
        setState(msg.payload);
        setNoRepository(false);
        setCommitting(false);
        lastAttempt.current = null;
        setPending((prev) => {
          if (prev.size === 0) return prev;
          const rawStaged = new Set(msg.payload.staged.map((f) => f.path));
          const next = new Map(prev);
          for (const [path, desired] of prev) {
            if (rawStaged.has(path) === desired) next.delete(path);
          }
          return next;
        });
      } else if (msg.type === 'error') {
        setCommitting(false);
        setPending(new Map());
        if (lastAttempt.current) {
          setSubject(lastAttempt.current.subject);
          setBody(lastAttempt.current.body);
          setAmend(lastAttempt.current.amend);
          lastAttempt.current = null;
        }
      } else if (msg.type === 'repos') {
        setRepos(msg.payload.repos);
        setActiveRepoRoot(msg.payload.activeRepoRoot);
      } else if (msg.type === 'noRepository') {
        setNoRepository(true);
      }
    });
    bus.send({ type: 'ready' });
    return unsubscribe;
  }, []);

  const toggleFile = (path: string, checked: boolean) => {
    setPending((prev) => new Map(prev).set(path, checked));
    bus.send({ type: checked ? 'stageFiles' : 'unstageFiles', payload: { paths: [path] } });
  };

  const toggleAll = (files: FileChange[], checked: boolean) => {
    setPending((prev) => {
      const next = new Map(prev);
      for (const f of files) next.set(f.path, checked);
      return next;
    });
    bus.send({
      type: checked ? 'stageFiles' : 'unstageFiles',
      payload: { paths: files.map((f) => f.path) },
    });
  };

  const openFile = (file: FileChange) => {
    bus.send({ type: 'openDiff', payload: { path: file.path, status: file.status, staged: file.staged } });
  };

  const openConflict = (file: FileChange) => {
    bus.send({ type: 'openConflictFile', payload: { path: file.path } });
  };

  const abortMerge = () => {
    bus.send({ type: 'abortMerge' });
  };

  const onSwitchRepository = (rootPath: string) => {
    bus.send({ type: 'switchRepository', payload: { rootPath } });
  };

  const onInitRepository = () => {
    bus.send({ type: 'initRepository' });
  };

  const onCloneRepository = () => {
    bus.send({ type: 'cloneRepository' });
  };

  const onToggleAmend = async (checked: boolean) => {
    setAmend(checked);
    if (checked) {
      try {
        const reply = await bus.request<{ type: 'amendMessage'; payload: { subject: string; body: string }; requestId: string }>({
          type: 'requestAmendMessage',
          requestId: nextRequestId(),
        });
        setSubject(reply.payload.subject);
        setBody(reply.payload.body);
      } catch {
        setAmend(false);
      }
    } else {
      setSubject('');
      setBody('');
    }
  };

  const doCommit = (push: boolean) => {
    lastAttempt.current = { subject, body, amend };
    setCommitting(true);
    bus.send({ type: 'commit', payload: { subject, body, amend, push } });
    setSubject('');
    setBody('');
    setAmend(false);
  };

  if (noRepository) {
    return (
      <div class="no-repo-state">
        <p>No git repository in this workspace yet.</p>
        <div class="no-repo-actions">
          <button onClick={onInitRepository}>Initialize Repository</button>
          <button class="secondary" onClick={onCloneRepository}>
            Clone Repository
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return <div class="empty-state">Loading…</div>;
  }

  const { merging, staged, unstaged, untracked } = applyPendingOverrides(state, pending);
  const nothingStaged = staged.length === 0;

  return (
    <div class="commit-app">
      <div class="branch-line">
        <span class="codicon codicon-git-branch"></span> {state.branchName ?? 'detached HEAD'}
        <RepoSelect repos={repos} activeRepoRoot={activeRepoRoot} onChange={onSwitchRepository} />
      </div>
      {state.merging.length > 0 && (
        <div class="merge-banner">
          <span>
            <span class="codicon codicon-warning"></span> Merge in progress ({state.merging.length} conflict
            {state.merging.length === 1 ? '' : 's'})
          </span>
          <button class="secondary" onClick={abortMerge}>
            Abort Merge
          </button>
        </div>
      )}
      <ChangesTree
        merging={merging}
        staged={staged}
        unstaged={unstaged}
        untracked={untracked}
        onToggleFile={toggleFile}
        onToggleAll={toggleAll}
        onOpenFile={openFile}
        onOpenConflict={openConflict}
      />
      <CommitMessageBox
        subject={subject}
        body={body}
        subjectLimit={state.subjectLineLimit}
        onSubjectChange={setSubject}
        onBodyChange={setBody}
      />
      <label class="amend-row">
        <input
          type="checkbox"
          checked={amend}
          disabled={!state.amendAvailable}
          onChange={(e) => onToggleAmend((e.target as HTMLInputElement).checked)}
        />
        Amend
      </label>
      {nothingStaged && <div class="hint">Nothing staged — stage changes to commit.</div>}
      <div class="commit-actions">
        <button disabled={nothingStaged || !subject.trim() || committing} onClick={() => doCommit(false)}>
          Commit
        </button>
        <button
          class="secondary"
          disabled={nothingStaged || !subject.trim() || committing}
          onClick={() => doCommit(true)}
        >
          Commit and Push
        </button>
      </div>
    </div>
  );
}
