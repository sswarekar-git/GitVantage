interface FilterBarProps {
  filterText: string;
  onFilterTextChange: (value: string) => void;
  branchScope: 'all' | 'current';
  onBranchScopeChange: (value: 'all' | 'current') => void;
}

export function FilterBar({ filterText, onFilterTextChange, branchScope, onBranchScopeChange }: FilterBarProps) {
  return (
    <div class="log-filter-bar">
      <span class="codicon codicon-search log-filter-icon"></span>
      <input
        type="text"
        placeholder="Filter commits…"
        value={filterText}
        onInput={(e) => onFilterTextChange((e.target as HTMLInputElement).value)}
      />
      <select
        class="log-branch-scope"
        value={branchScope}
        onChange={(e) => onBranchScopeChange((e.target as HTMLSelectElement).value as 'all' | 'current')}
      >
        <option value="all">All branches</option>
        <option value="current">Current branch</option>
      </select>
    </div>
  );
}
