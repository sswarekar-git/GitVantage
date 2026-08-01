import { useState } from 'preact/hooks';
import type { FileChange } from '../common/protocol';

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

const STATUS_LABEL: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  '?': 'Untracked',
  '!': 'Conflict',
};

interface SectionProps {
  title: string;
  files: FileChange[];
  allChecked: boolean;
  warn?: boolean;
  onToggleAll: (checked: boolean) => void;
  onToggleFile: (path: string, checked: boolean) => void;
  onOpenFile: (file: FileChange) => void;
}

function Section({ title, files, allChecked, warn, onToggleAll, onToggleFile, onOpenFile }: SectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (files.length === 0) return null;

  return (
    <div class={`changes-section ${warn ? 'changes-section-warn' : ''}`}>
      <div class="changes-section-header">
        <span
          class={`codicon changes-section-chevron ${collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}`}
          onClick={() => setCollapsed(!collapsed)}
        ></span>
        <input
          type="checkbox"
          checked={allChecked}
          onChange={(e) => onToggleAll((e.target as HTMLInputElement).checked)}
        />
        {warn && <span class="codicon codicon-warning changes-section-warn-icon"></span>}
        <span class="changes-section-title" onClick={() => setCollapsed(!collapsed)}>
          {title}
        </span>
        <span class="changes-section-count">{files.length}</span>
      </div>
      {!collapsed &&
        files.map((f) => (
          <div class="changes-row" key={f.path}>
            <input
              type="checkbox"
              checked={f.staged}
              onChange={(e) => onToggleFile(f.path, (e.target as HTMLInputElement).checked)}
            />
            <span class={`status-badge status-${f.status}`} title={STATUS_LABEL[f.status] ?? f.status}>
              {f.status}
            </span>
            <span class="codicon codicon-file changes-row-icon"></span>
            <span class="changes-row-name" onClick={() => onOpenFile(f)} title={f.path}>
              {basename(f.path)}
            </span>
          </div>
        ))}
    </div>
  );
}

interface ChangesTreeProps {
  merging: FileChange[];
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
  onToggleFile: (path: string, checked: boolean) => void;
  onToggleAll: (files: FileChange[], checked: boolean) => void;
  onOpenFile: (file: FileChange) => void;
  onOpenConflict: (file: FileChange) => void;
}

export function ChangesTree({
  merging,
  staged,
  unstaged,
  untracked,
  onToggleFile,
  onToggleAll,
  onOpenFile,
  onOpenConflict,
}: ChangesTreeProps) {
  if (merging.length === 0 && staged.length === 0 && unstaged.length === 0 && untracked.length === 0) {
    return (
      <div class="empty-state">
        <span class="codicon codicon-check"></span> No changes
      </div>
    );
  }
  return (
    <div class="changes-tree">
      <Section
        title="Merge Conflicts"
        files={merging}
        allChecked={false}
        warn
        onToggleAll={(checked) => onToggleAll(merging, checked)}
        onToggleFile={onToggleFile}
        onOpenFile={onOpenConflict}
      />
      <Section
        title="Staged Changes"
        files={staged}
        allChecked={staged.length > 0}
        onToggleAll={(checked) => onToggleAll(staged, checked)}
        onToggleFile={onToggleFile}
        onOpenFile={onOpenFile}
      />
      <Section
        title="Unstaged Changes"
        files={unstaged}
        allChecked={false}
        onToggleAll={(checked) => onToggleAll(unstaged, checked)}
        onToggleFile={onToggleFile}
        onOpenFile={onOpenFile}
      />
      <Section
        title="Untracked Files"
        files={untracked}
        allChecked={false}
        onToggleAll={(checked) => onToggleAll(untracked, checked)}
        onToggleFile={onToggleFile}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}
