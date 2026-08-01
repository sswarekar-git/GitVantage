import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type {
  BranchAction,
  BranchInfo,
  CommitAction,
  CommitInfo,
  DiffFile,
  HostToWebviewLogMessage,
  RepoSummary,
  WebviewToHostLogMessage,
} from './protocol';
import { createMessageBus } from '../common/messageBus';
import { computeGraphLayout, type GraphRow, type LaneState } from './graphLayout';
import { CommitRow } from './CommitRow';
import { CommitDetails } from './CommitDetails';
import { FilterBar } from './FilterBar';
import { BranchesColumn } from './BranchesColumn';
import { FilesTree } from './FilesTree';
import { RepoSelect } from '../common/repo/RepoSelect';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';

const bus = createMessageBus<HostToWebviewLogMessage, WebviewToHostLogMessage>();
bus.init();

const DEFAULT_PAGE_SIZE = 200;

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `log-req-${requestCounter}`;
}

interface MenuState {
  x: number;
  y: number;
  sha: string;
}

export function App() {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [graphRows, setGraphRows] = useState<GraphRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [branchScope, setBranchScope] = useState<'all' | 'current'>('all');
  const [headSha, setHeadSha] = useState<string | undefined>(undefined);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [selectedSha, setSelectedSha] = useState<string | undefined>(undefined);
  const [selectedFiles, setSelectedFiles] = useState<DiffFile[] | undefined>(undefined);
  const [filesLoading, setFilesLoading] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [activeRepoRoot, setActiveRepoRoot] = useState<string | undefined>(undefined);
  const [noRepository, setNoRepository] = useState(false);
  const laneStateRef = useRef<LaneState | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const filterDebounceRef = useRef<number | undefined>(undefined);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE);
  const filterTextRef = useRef('');
  const branchScopeRef = useRef<'all' | 'current'>('all');

  const loadPage = useCallback(
    async (skip: number, reset: boolean, text: string, scope: 'all' | 'current') => {
      loadingRef.current = true;
      setLoading(true);
      setLoadError(undefined);
      try {
        const reply = await bus.request<Extract<HostToWebviewLogMessage, { type: 'logPage' }>>({
          type: 'requestLogPage',
          payload: { skip, limit: pageSizeRef.current, branchScope: scope, filterText: text || undefined },
          requestId: nextRequestId(),
        });
        const page = reply.payload;
        if (reset) laneStateRef.current = undefined;
        const { rows, laneState } = computeGraphLayout(page.commits, laneStateRef.current);
        laneStateRef.current = laneState;
        setCommits((prev) => (reset ? page.commits : [...prev, ...page.commits]));
        setGraphRows((prev) => (reset ? rows : [...prev, ...rows]));
        setHasMore(page.hasMore);
        hasMoreRef.current = page.hasMore;
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        hasMoreRef.current = false;
        setHasMore(false);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const unsubscribe = bus.onMessage((msg) => {
      if (msg.type === 'init') {
        // Fires on first load AND whenever the host detects repo state changed
        // (a mutating action from this panel, the Commit view, or an external
        // `git` command) — reload with whatever filter/scope is current rather
        // than resetting them, and drop any now-possibly-stale selection.
        setNoRepository(false);
        setHeadSha(msg.payload.headSha);
        pageSizeRef.current = msg.payload.pageSize;
        setSelectedSha(undefined);
        setSelectedFiles(undefined);
        loadPage(0, true, filterTextRef.current, branchScopeRef.current);
      } else if (msg.type === 'branches') {
        setBranches(msg.payload.branches);
      } else if (msg.type === 'repos') {
        setRepos(msg.payload.repos);
        setActiveRepoRoot(msg.payload.activeRepoRoot);
      } else if (msg.type === 'noRepository') {
        setNoRepository(true);
      }
    });
    bus.send({ type: 'ready' });
    return unsubscribe;
  }, [loadPage]);

  const onFilterTextChange = (value: string) => {
    setFilterText(value);
    filterTextRef.current = value;
    if (filterDebounceRef.current) window.clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = window.setTimeout(() => {
      loadPage(0, true, value, branchScopeRef.current);
    }, 250);
  };

  const onBranchScopeChange = (value: 'all' | 'current') => {
    setBranchScope(value);
    branchScopeRef.current = value;
    loadPage(0, true, filterTextRef.current, value);
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || loadingRef.current || !hasMoreRef.current) return;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 200) {
      loadPage(commits.length, false, filterText, branchScope);
    }
  };

  const onSelectCommit = async (sha: string) => {
    if (selectedSha === sha) {
      setSelectedSha(undefined);
      setSelectedFiles(undefined);
      return;
    }
    const commit = commits.find((c) => c.sha === sha);
    setSelectedSha(sha);
    setSelectedFiles(undefined);
    setFilesLoading(true);
    try {
      const reply = await bus.request<Extract<HostToWebviewLogMessage, { type: 'commitFiles' }>>({
        type: 'requestCommitFiles',
        payload: { sha, parentSha: commit?.parents[0] },
        requestId: nextRequestId(),
      });
      setSelectedFiles(reply.payload.files);
    } catch {
      setSelectedFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  const onOpenCommitFile = (file: DiffFile) => {
    const commit = commits.find((c) => c.sha === selectedSha);
    if (!commit) return;
    bus.send({
      type: 'openCommitFile',
      payload: { sha: commit.sha, parentSha: commit.parents[0], path: file.path, status: file.status },
    });
  };

  const onBranchAction = (name: string, isRemote: boolean, action: BranchAction) => {
    bus.send({ type: 'branchAction', payload: { name, isRemote, action } });
  };

  const onPruneRemote = (remote: string) => {
    bus.send({ type: 'pruneRemote', payload: { remote } });
  };

  const onSwitchRepository = (rootPath: string) => {
    bus.send({ type: 'switchRepository', payload: { rootPath } });
  };

  const onContextMenu = (e: MouseEvent, sha: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, sha });
  };

  const menuItems: ContextMenuItem[] = [
    { label: 'Checkout', action: 'checkout' },
    { label: 'New Branch from Here…', action: 'createBranch' },
    { label: 'Cherry-Pick', action: 'cherryPick', separatorBefore: true },
    { label: 'Revert Commit', action: 'revert' },
    { label: 'Compare with HEAD', action: 'compareHead', separatorBefore: true },
    { label: 'Compare with Working Tree', action: 'compareWorkingTree' },
    { label: 'Reset Current Branch to Here (Soft)', action: 'resetSoft', separatorBefore: true },
    { label: 'Reset Current Branch to Here (Hard)', action: 'resetHard', danger: true },
  ];

  const laneCount = graphRows.reduce(
    (max, r) => Math.max(max, r.lane + 1, ...r.parentLanes.map((l) => l + 1)),
    1,
  );

  const selectedCommit = selectedSha ? commits.find((c) => c.sha === selectedSha) : undefined;

  return (
    <div class="log-app">
      <BranchesColumn branches={branches} onAction={onBranchAction} onPruneRemote={onPruneRemote} />
      <div class="log-main">
        <div class="log-top-row">
          <div class="log-commits-col">
            <FilterBar
              filterText={filterText}
              onFilterTextChange={onFilterTextChange}
              branchScope={branchScope}
              onBranchScopeChange={onBranchScopeChange}
            />
            <RepoSelect repos={repos} activeRepoRoot={activeRepoRoot} onChange={onSwitchRepository} />
            <div class="log-header-row">
              <div class="log-header-graph"></div>
              <div class="log-header-subject">Subject</div>
              <div class="log-header-date">Date</div>
              <div class="log-header-sha">Commit</div>
            </div>
            <div class="log-scroll" ref={scrollRef} onScroll={onScroll}>
              {commits.map((commit, i) => (
                <CommitRow
                  key={commit.sha}
                  commit={commit}
                  graphRow={graphRows[i]}
                  laneCount={laneCount}
                  isHead={commit.sha === headSha}
                  selected={commit.sha === selectedSha}
                  onContextMenu={onContextMenu}
                  onClick={onSelectCommit}
                />
              ))}
              {loading && <div class="log-loading">Loading…</div>}
              {!loading && loadError && <div class="log-error">GitVantage: {loadError}</div>}
              {!loading && !loadError && noRepository && (
                <div class="empty-state">No git repository in this workspace — open the Commit view to initialize or clone one.</div>
              )}
              {!loading && !loadError && !noRepository && commits.length === 0 && (
                <div class="empty-state">No commits found</div>
              )}
            </div>
          </div>
          <div class="log-files-col">
            {selectedSha ? (
              <FilesTree files={selectedFiles} loading={filesLoading} onOpenFile={onOpenCommitFile} />
            ) : (
              <div class="empty-state">Select a commit to see its changed files</div>
            )}
          </div>
        </div>
        {selectedCommit && (
          <CommitDetails
            commit={selectedCommit}
            onClose={() => {
              setSelectedSha(undefined);
              setSelectedFiles(undefined);
            }}
          />
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          onSelect={(action) => {
            bus.send({ type: 'commitAction', payload: { sha: menu.sha, action: action as CommitAction } });
          }}
        />
      )}
    </div>
  );
}
