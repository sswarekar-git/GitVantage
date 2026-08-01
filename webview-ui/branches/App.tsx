import { useEffect, useMemo, useState } from 'preact/hooks';
import type { HostToWebviewBranchesMessage, RepoSummary, WebviewToHostBranchesMessage } from './protocol';
import type { BranchAction, BranchInfo } from '../common/branches/types';
import { createMessageBus } from '../common/messageBus';
import { fuzzyMatch } from '../common/branches/fuzzyMatch';
import { FuzzySearchInput } from '../common/branches/FuzzySearchInput';
import { BranchList, type MatchedBranch } from '../common/branches/BranchList';
import { RepoSelect } from '../common/repo/RepoSelect';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';

const bus = createMessageBus<HostToWebviewBranchesMessage, WebviewToHostBranchesMessage>();
bus.init();

interface MenuState {
  x: number;
  y: number;
  branch: BranchInfo;
}

export function App() {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [activeRepoRoot, setActiveRepoRoot] = useState<string | undefined>(undefined);
  const [noRepository, setNoRepository] = useState(false);

  useEffect(() => {
    const unsubscribe = bus.onMessage((msg) => {
      if (msg.type === 'state') {
        setNoRepository(false);
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
  }, []);

  const { local, remote } = useMemo(() => {
    const matched: MatchedBranch[] = [];
    for (const branch of branches) {
      const match = fuzzyMatch(query, branch.name);
      if (match) matched.push({ branch, match });
    }
    matched.sort((a, b) => {
      if (a.branch.isCurrent !== b.branch.isCurrent) return a.branch.isCurrent ? -1 : 1;
      return b.match.score - a.match.score;
    });
    return {
      local: matched.filter((m) => !m.branch.isRemote),
      remote: matched.filter((m) => m.branch.isRemote),
    };
  }, [branches, query]);

  const checkout = (branch: BranchInfo) => {
    bus.send({ type: 'branchAction', payload: { name: branch.name, isRemote: branch.isRemote, action: 'checkout' } });
  };

  const dispatch = (branch: BranchInfo, action: BranchAction) => {
    bus.send({ type: 'branchAction', payload: { name: branch.name, isRemote: branch.isRemote, action } });
  };

  const onContextMenu = (e: MouseEvent, branch: BranchInfo) => {
    e.preventDefault();
    setSelected(branch.name);
    setMenu({ x: e.clientX, y: e.clientY, branch });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && selected) {
      const branch = branches.find((b) => b.name === selected);
      if (branch) checkout(branch);
    }
  };

  const menuItems: ContextMenuItem[] = menu
    ? [
        { label: 'Checkout', action: 'checkout' },
        { label: 'New Branch from Here…', action: 'newBranchFrom' },
        { label: 'Compare with Current', action: 'compare', separatorBefore: true },
        { label: 'Merge into Current', action: 'merge' },
        { label: 'Rebase Current onto This', action: 'rebase' },
        ...(!menu.branch.isRemote ? [{ label: 'Rename…', action: 'rename', separatorBefore: true }] : []),
        { label: 'Delete', action: 'delete', danger: true, separatorBefore: menu.branch.isRemote },
      ]
    : [];

  if (noRepository) {
    return (
      <div class="branches-app">
        <div class="empty-state">No git repository in this workspace — open the Commit view to initialize or clone one.</div>
      </div>
    );
  }

  return (
    <div class="branches-app">
      <RepoSelect
        repos={repos}
        activeRepoRoot={activeRepoRoot}
        onChange={(rootPath) => bus.send({ type: 'switchRepository', payload: { rootPath } })}
      />
      <FuzzySearchInput value={query} onChange={setQuery} onKeyDown={onKeyDown} />
      <div class="branches-scroll">
        <BranchList
          title="Local"
          entries={local}
          selectedName={selected}
          onSelect={setSelected}
          onCheckout={checkout}
          onContextMenu={onContextMenu}
        />
        <BranchList
          title="Remote"
          entries={remote}
          selectedName={selected}
          onSelect={setSelected}
          onCheckout={checkout}
          onContextMenu={onContextMenu}
        />
        {local.length === 0 && remote.length === 0 && <div class="empty-state">No matching branches</div>}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          onSelect={(action) => dispatch(menu.branch, action as BranchAction)}
        />
      )}
    </div>
  );
}
