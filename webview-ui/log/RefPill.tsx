interface ParsedRef {
  kind: 'head' | 'local' | 'remote' | 'tag';
  label: string;
}

function parseRef(raw: string): ParsedRef {
  if (raw.startsWith('HEAD -> ')) return { kind: 'head', label: raw.slice('HEAD -> '.length) };
  if (raw === 'HEAD') return { kind: 'head', label: raw };
  if (raw.startsWith('tag: ')) return { kind: 'tag', label: raw.slice('tag: '.length) };
  if (raw.includes('/')) return { kind: 'remote', label: raw };
  return { kind: 'local', label: raw };
}

export function RefPill({ raw }: { raw: string }) {
  const { kind, label } = parseRef(raw);
  return <span class={`ref-pill ref-pill-${kind}`}>{label}</span>;
}
