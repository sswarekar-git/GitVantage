import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

export interface ContextMenuItem {
  label: string;
  action: string;
  danger?: boolean;
  separatorBefore?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onSelect: (action: string) => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onSelect, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // The Log view docks in VS Code's bottom panel — much shorter than a full
  // editor tab — so a menu opened near the bottom/edge of the (position:
  // fixed) webview viewport routinely rendered past it with no way to
  // scroll it into view. Clamp after mount, before paint, so it never
  // flickers at the unclamped position first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 4;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, Math.max(margin, window.innerWidth - rect.width - margin));
    const top = Math.min(y, Math.max(margin, window.innerHeight - rect.height - margin));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    // Clicks outside the webview's own frame (editor, another panel/tab) never
    // reach this document, so a mousedown listener alone can't catch them —
    // fall back to closing whenever the webview loses focus.
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} class="context-menu" style={{ left: `${x}px`, top: `${y}px` }}>
      {items.map((item) => (
        <div key={item.action}>
          {item.separatorBefore && <div class="context-menu-separator" />}
          <div
            class={`context-menu-item ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              onSelect(item.action);
              onClose();
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
