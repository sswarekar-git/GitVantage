import { useMemo, useState } from 'preact/hooks';
import type { BranchAction, BranchInfo } from './protocol';
import { fuzzyMatch } from '../common/branches/fuzzyMatch';
import { FuzzySearchInput } from '../common/branches/FuzzySearchInput';
import { BranchList, type MatchedBranch } from '../common/branches/BranchList';
import { BranchesTree } from './BranchesTree';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';

interface MenuState {
  x: number;
  y: number;
  branch: BranchInfo;
}

interface RemoteMenuState {
  x: number;
  y: number;
  remoteName: string;
}

interface BranchesColumnProps {
  branches: BranchInfo[];
  onAction: (name: string, isRemote: boolean, action: BranchAction) => void;
  onPruneRemote: (remoteName: string) => void;
}

export function BranchesColumn({ branches, onAction, onPruneRemote }: BranchesColumnProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [remoteMenu, setRemoteMenu] = useState<RemoteMenuState | null>(null);

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

  const checkout = (branch: BranchInfo) => onAction(branch.name, branch.isRemote, 'checkout');
  const dispatch = (branch: BranchInfo, action: BranchAction) => onAction(branch.name, branch.isRemote, action);

  const onContextMenu = (e: MouseEvent, branch: BranchInfo) => {
    e.preventDefault();
    setSelected(branch.name);
    setMenu({ x: e.clientX, y: e.clientY, branch });
  };

  const onRemoteContextMenu = (e: MouseEvent, remoteName: string) => {
    e.preventDefault();
    setRemoteMenu({ x: e.clientX, y: e.clientY, remoteName });
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

  const remoteMenuItems: ContextMenuItem[] = [{ label: 'Prune Deleted Branches', action: 'prune' }];

  return (
    <div class="log-branches-col">
      <FuzzySearchInput value={query} onChange={setQuery} />
      <div class="branches-scroll">
        {query ? (
          <>
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
          </>
        ) : (
          <BranchesTree
            branches={branches}
            onCheckout={checkout}
            onBranchContextMenu={onContextMenu}
            onRemoteContextMenu={onRemoteContextMenu}
          />
        )}
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
      {remoteMenu && (
        <ContextMenu
          x={remoteMenu.x}
          y={remoteMenu.y}
          items={remoteMenuItems}
          onClose={() => setRemoteMenu(null)}
          onSelect={() => onPruneRemote(remoteMenu.remoteName)}
        />
      )}
    </div>
  );
}
