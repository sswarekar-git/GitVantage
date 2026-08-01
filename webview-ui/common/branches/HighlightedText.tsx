interface HighlightedTextProps {
  text: string;
  indices: number[];
}

export function HighlightedText({ text, indices }: HighlightedTextProps) {
  if (indices.length === 0) return <>{text}</>;
  const indexSet = new Set(indices);
  return (
    <>
      {text.split('').map((ch, i) =>
        indexSet.has(i) ? (
          <mark key={i} class="fuzzy-highlight">
            {ch}
          </mark>
        ) : (
          ch
        ),
      )}
    </>
  );
}
