import { useState } from 'preact/hooks';
import type { BranchInfo } from './protocol';
import { buildBranchGroups, type BranchTreeNode } from './branchTree';

interface NodeRowProps {
  node: BranchTreeNode;
  depth: number;
  onCheckout: (branch: BranchInfo) => void;
  onBranchContextMenu: (e: MouseEvent, branch: BranchInfo) => void;
}

function NodeRow({ node, depth, onCheckout, onBranchContextMenu }: NodeRowProps) {
  const [collapsed, setCollapsed] = useState(false);
  const indent = { paddingLeft: `${8 + depth * 14}px` };

  if (node.kind === 'folder') {
    return (
      <>
        <div class="branch-tree-folder-row" style={indent} onClick={() => setCollapsed(!collapsed)}>
          <span class={`codicon ${collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`}></span>
          <span class="codicon codicon-folder file-tree-icon"></span>
          <span class="branch-tree-folder-name">{node.name}</span>
        </div>
        {!collapsed &&
          node.children.map((child) => (
            <NodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              onCheckout={onCheckout}
              onBranchContextMenu={onBranchContextMenu}
            />
          ))}
      </>
    );
  }

  const { branch } = node;
  return (
    <div
      class={`branch-row ${branch.isCurrent ? 'current' : ''}`}
      style={indent}
      onDblClick={() => onCheckout(branch)}
      onContextMenu={(e) => onBranchContextMenu(e, branch)}
    >
      {branch.isCurrent && <span class="codicon codicon-check branch-current-icon"></span>}
      <span class="branch-name">{node.name}</span>
      {branch.upstreamGone && (
        <span class="branch-gone" title="Upstream branch was deleted">
          gone
        </span>
      )}
      {(!!branch.ahead || !!branch.behind) && (
        <span class="branch-tracking">
          {!!branch.ahead && <span class="ahead">↑{branch.ahead}</span>}
          {!!branch.behind && <span class="behind">↓{branch.behind}</span>}
        </span>
      )}
    </div>
  );
}

interface BranchTreeProps {
  branches: BranchInfo[];
  onCheckout: (branch: BranchInfo) => void;
  onBranchContextMenu: (e: MouseEvent, branch: BranchInfo) => void;
  onRemoteContextMenu: (e: MouseEvent, remoteName: string) => void;
}

export function BranchesTree({ branches, onCheckout, onBranchContextMenu, onRemoteContextMenu }: BranchTreeProps) {
  const groups = buildBranchGroups(branches);
  if (groups.length === 0) return <div class="empty-state">No branches</div>;

  return (
    <div class="branch-tree">
      {groups.map((group) => (
        <div class="branch-group" key={group.title}>
          <div
            class="branch-group-title"
            onContextMenu={group.remoteName ? (e) => onRemoteContextMenu(e, group.remoteName!) : undefined}
          >
            {group.title}
          </div>
          {group.nodes.map((node) => (
            <NodeRow
              key={node.path}
              node={node}
              depth={0}
              onCheckout={onCheckout}
              onBranchContextMenu={onBranchContextMenu}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
