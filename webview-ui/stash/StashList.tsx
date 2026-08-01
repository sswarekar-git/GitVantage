import type { StashFile, StashInfo } from './protocol';

interface StashRowProps {
  stash: StashInfo;
  expanded: boolean;
  files: StashFile[] | undefined;
  onToggleExpand: () => void;
  onApply: () => void;
  onPop: () => void;
  onDrop: () => void;
  onOpenFile: (path: string) => void;
}

function StashRow({ stash, expanded, files, onToggleExpand, onApply, onPop, onDrop, onOpenFile }: StashRowProps) {
  return (
    <div class="stash-entry">
      <div class="stash-row" onClick={onToggleExpand}>
        <span class={`codicon changes-section-chevron ${expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`}></span>
        <div class="stash-row-main">
          <div class="stash-message">{stash.message}</div>
          <div class="stash-meta">
            {stash.branch && <span class="stash-branch">{stash.branch}</span>}
            <span class="stash-date">{stash.date}</span>
          </div>
        </div>
        <div class="stash-row-actions" onClick={(e) => e.stopPropagation()}>
          <button title="Apply" onClick={onApply}>
            <span class="codicon codicon-check"></span>
          </button>
          <button title="Pop" onClick={onPop}>
            <span class="codicon codicon-arrow-up"></span>
          </button>
          <button title="Drop" class="danger" onClick={onDrop}>
            <span class="codicon codicon-trash"></span>
          </button>
        </div>
      </div>
      {expanded && (
        <div class="stash-files">
          {!files && <div class="stash-files-loading">Loading…</div>}
          {files?.map((f) => (
            <div class="stash-file-row" key={f.path} onClick={() => onOpenFile(f.path)}>
              <span class={`status-badge status-${f.status}`}>{f.status.charAt(0)}</span>
              <span class="stash-file-path">{f.path}</span>
            </div>
          ))}
          {files?.length === 0 && <div class="stash-files-loading">No files</div>}
        </div>
      )}
    </div>
  );
}

interface StashListProps {
  stashes: StashInfo[];
  expandedRef: string | undefined;
  files: StashFile[] | undefined;
  onToggleExpand: (ref: string) => void;
  onApply: (ref: string) => void;
  onPop: (ref: string) => void;
  onDrop: (ref: string) => void;
  onOpenFile: (ref: string, path: string) => void;
}

export function StashList({
  stashes,
  expandedRef,
  files,
  onToggleExpand,
  onApply,
  onPop,
  onDrop,
  onOpenFile,
}: StashListProps) {
  if (stashes.length === 0) {
    return (
      <div class="empty-state">
        <span class="codicon codicon-inbox"></span> No stashes
      </div>
    );
  }
  return (
    <div class="stash-list">
      {stashes.map((stash) => (
        <StashRow
          key={stash.ref}
          stash={stash}
          expanded={stash.ref === expandedRef}
          files={stash.ref === expandedRef ? files : undefined}
          onToggleExpand={() => onToggleExpand(stash.ref)}
          onApply={() => onApply(stash.ref)}
          onPop={() => onPop(stash.ref)}
          onDrop={() => onDrop(stash.ref)}
          onOpenFile={(path) => onOpenFile(stash.ref, path)}
        />
      ))}
    </div>
  );
}
