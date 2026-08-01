import { useEffect, useState } from 'preact/hooks';
import type {
  HostToWebviewStashMessage,
  RepoSummary,
  StashFile,
  StashInfo,
  WebviewToHostStashMessage,
} from './protocol';
import { createMessageBus } from '../common/messageBus';
import { StashList } from './StashList';
import { CreateStashForm } from './CreateStashForm';
import { RepoSelect } from '../common/repo/RepoSelect';

const bus = createMessageBus<HostToWebviewStashMessage, WebviewToHostStashMessage>();
bus.init();

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `stash-req-${requestCounter}`;
}

export function App() {
  const [stashes, setStashes] = useState<StashInfo[]>([]);
  const [expandedRef, setExpandedRef] = useState<string | undefined>(undefined);
  const [files, setFiles] = useState<StashFile[] | undefined>(undefined);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [activeRepoRoot, setActiveRepoRoot] = useState<string | undefined>(undefined);
  const [noRepository, setNoRepository] = useState(false);

  useEffect(() => {
    const unsubscribe = bus.onMessage((msg) => {
      if (msg.type === 'state') {
        setNoRepository(false);
        setStashes(msg.payload.stashes);
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

  const toggleExpand = async (ref: string) => {
    if (expandedRef === ref) {
      setExpandedRef(undefined);
      setFiles(undefined);
      return;
    }
    setExpandedRef(ref);
    setFiles(undefined);
    try {
      const reply = await bus.request<Extract<HostToWebviewStashMessage, { type: 'stashFiles' }>>({
        type: 'requestStashFiles',
        payload: { ref },
        requestId: nextRequestId(),
      });
      setFiles(reply.payload.files);
    } catch {
      setFiles([]);
    }
  };

  if (noRepository) {
    return (
      <div class="stash-app">
        <div class="empty-state">No git repository in this workspace — open the Commit view to initialize or clone one.</div>
      </div>
    );
  }

  return (
    <div class="stash-app">
      <RepoSelect
        repos={repos}
        activeRepoRoot={activeRepoRoot}
        onChange={(rootPath) => bus.send({ type: 'switchRepository', payload: { rootPath } })}
      />
      <CreateStashForm onCreate={(opts) => bus.send({ type: 'createStash', payload: opts })} />
      <div class="stash-scroll">
        <StashList
          stashes={stashes}
          expandedRef={expandedRef}
          files={files}
          onToggleExpand={toggleExpand}
          onApply={(ref) => bus.send({ type: 'stashAction', payload: { ref, action: 'apply' } })}
          onPop={(ref) => bus.send({ type: 'stashAction', payload: { ref, action: 'pop' } })}
          onDrop={(ref) => bus.send({ type: 'stashAction', payload: { ref, action: 'drop' } })}
          onOpenFile={(ref, path) => bus.send({ type: 'openStashFile', payload: { ref, path } })}
        />
      </div>
    </div>
  );
}
