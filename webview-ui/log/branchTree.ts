import type { BranchInfo } from './protocol';

export interface BranchTreeFolderNode {
  kind: 'folder';
  name: string;
  path: string;
  children: BranchTreeNode[];
}

export interface BranchTreeLeafNode {
  kind: 'branch';
  name: string;
  path: string;
  branch: BranchInfo;
}

export type BranchTreeNode = BranchTreeFolderNode | BranchTreeLeafNode;

export interface BranchGroup {
  title: string;
  // undefined for the "Local" group, the remote's name (e.g. "origin") otherwise.
  remoteName: string | undefined;
  nodes: BranchTreeNode[];
}

function remoteNameOf(branch: BranchInfo): string {
  const slashIdx = branch.name.indexOf('/');
  return slashIdx === -1 ? branch.name : branch.name.slice(0, slashIdx);
}

function buildTree(branches: BranchInfo[], pathOf: (b: BranchInfo) => string): BranchTreeNode[] {
  const root: BranchTreeFolderNode = { kind: 'folder', name: '', path: '', children: [] };

  for (const branch of branches) {
    const segments = pathOf(branch).split('/').filter(Boolean);
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const name = segments[i];
      const path = segments.slice(0, i + 1).join('/');
      let next = cursor.children.find((c) => c.kind === 'folder' && c.name === name) as
        | BranchTreeFolderNode
        | undefined;
      if (!next) {
        next = { kind: 'folder', name, path, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    }
    const name = segments[segments.length - 1] ?? pathOf(branch);
    cursor.children.push({ kind: 'branch', name, path: pathOf(branch), branch });
  }

  sortTree(root.children);
  return root.children;
}

function sortTree(nodes: BranchTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.kind === 'folder') sortTree(node.children);
  }
}

// Groups branches into a "Local" section plus one section per distinct
// remote, each rendered as a nested tree by `/`-separated path segments —
// mirrors fileTree.ts's grouping/sorting approach.
export function buildBranchGroups(branches: BranchInfo[]): BranchGroup[] {
  const local = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);
  const remoteNames = Array.from(new Set(remoteBranches.map(remoteNameOf))).sort();

  const groups: BranchGroup[] = [];
  if (local.length > 0) {
    groups.push({ title: 'Local', remoteName: undefined, nodes: buildTree(local, (b) => b.name) });
  }
  for (const remoteName of remoteNames) {
    const branchesForRemote = remoteBranches.filter((b) => remoteNameOf(b) === remoteName);
    groups.push({
      title: remoteName,
      remoteName,
      nodes: buildTree(branchesForRemote, (b) => b.name.slice(remoteName.length + 1)),
    });
  }
  return groups;
}
