import { useState } from 'preact/hooks';
import type { DiffFile } from './protocol';
import { buildFileTree, type FileTreeNode } from './fileTree';

interface RowProps {
  node: FileTreeNode;
  depth: number;
  onOpenFile: (file: DiffFile) => void;
}

function Row({ node, depth, onOpenFile }: RowProps) {
  const [collapsed, setCollapsed] = useState(false);
  const indent = { paddingLeft: `${8 + depth * 14}px` };

  if (node.kind === 'folder') {
    return (
      <>
        <div class="file-tree-row file-tree-folder-row" style={indent} onClick={() => setCollapsed(!collapsed)}>
          <span class={`codicon ${collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`}></span>
          <span class="codicon codicon-folder file-tree-icon"></span>
          <span class="file-tree-name">{node.name}</span>
        </div>
        {!collapsed &&
          node.children.map((child) => <Row key={child.path} node={child} depth={depth + 1} onOpenFile={onOpenFile} />)}
      </>
    );
  }

  return (
    <div
      class="file-tree-row file-tree-file-row"
      style={indent}
      onClick={() => onOpenFile({ path: node.path, status: node.status })}
    >
      <span class={`status-badge status-${node.status.charAt(0)}`}>{node.status.charAt(0)}</span>
      <span class="file-tree-name">{node.name}</span>
    </div>
  );
}

interface FilesTreeProps {
  files: DiffFile[] | undefined;
  loading: boolean;
  onOpenFile: (file: DiffFile) => void;
}

export function FilesTree({ files, loading, onOpenFile }: FilesTreeProps) {
  if (loading) return <div class="log-loading">Loading…</div>;
  if (!files || files.length === 0) return <div class="empty-state">No files changed</div>;

  const tree = buildFileTree(files);
  return (
    <div class="file-tree">
      {tree.map((node) => (
        <Row key={node.path} node={node} depth={0} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}
