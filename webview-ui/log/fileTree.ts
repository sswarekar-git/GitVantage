import type { DiffFile } from './protocol';

export interface FileTreeFolderNode {
  kind: 'folder';
  name: string;
  path: string;
  children: FileTreeNode[];
}

export interface FileTreeFileNode {
  kind: 'file';
  name: string;
  path: string;
  status: string;
}

export type FileTreeNode = FileTreeFolderNode | FileTreeFileNode;

// Groups a flat diff-file list into a nested tree by `/`-separated path
// segments — one node per segment, no compaction of single-child chains.
export function buildFileTree(files: DiffFile[]): FileTreeNode[] {
  const root: FileTreeFolderNode = { kind: 'folder', name: '', path: '', children: [] };

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const name = segments[i];
      const path = segments.slice(0, i + 1).join('/');
      let next = cursor.children.find((c) => c.kind === 'folder' && c.name === name) as
        | FileTreeFolderNode
        | undefined;
      if (!next) {
        next = { kind: 'folder', name, path, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    }
    const name = segments[segments.length - 1] ?? file.path;
    cursor.children.push({ kind: 'file', name, path: file.path, status: file.status });
  }

  sortTree(root.children);
  return root.children;
}

function sortTree(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.kind === 'folder') sortTree(node.children);
  }
}
