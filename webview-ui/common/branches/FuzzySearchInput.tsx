interface FuzzySearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
}

export function FuzzySearchInput({ value, onChange, onKeyDown, inputRef }: FuzzySearchInputProps) {
  return (
    <div class="branches-search">
      <span class="codicon codicon-search branches-search-icon"></span>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search branches…"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={onKeyDown}
        autoFocus
      />
    </div>
  );
}
