import type { BranchInfo } from './types';
import type { FuzzyMatch } from './fuzzyMatch';
import { HighlightedText } from './HighlightedText';

export interface MatchedBranch {
  branch: BranchInfo;
  match: FuzzyMatch;
}

interface BranchRowProps {
  entry: MatchedBranch;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
}

function BranchRow({ entry, selected, onClick, onDoubleClick, onContextMenu }: BranchRowProps) {
  const { branch, match } = entry;
  return (
    <div
      class={`branch-row ${selected ? 'selected' : ''} ${branch.isCurrent ? 'current' : ''}`}
      onClick={onClick}
      onDblClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {branch.isCurrent && <span class="codicon codicon-check branch-current-icon"></span>}
      <span class="branch-name">
        <HighlightedText text={branch.name} indices={match.indices} />
      </span>
      {(branch.ahead || branch.behind) && (
        <span class="branch-tracking">
          {!!branch.ahead && <span class="ahead">↑{branch.ahead}</span>}
          {!!branch.behind && <span class="behind">↓{branch.behind}</span>}
        </span>
      )}
      <span class="branch-subject" title={branch.lastCommitSubject}>
        {branch.lastCommitSubject}
      </span>
      <span class="branch-date">{branch.lastCommitDate}</span>
    </div>
  );
}

interface BranchListProps {
  title: string;
  entries: MatchedBranch[];
  selectedName: string | undefined;
  onSelect: (name: string) => void;
  onCheckout: (branch: BranchInfo) => void;
  onContextMenu: (e: MouseEvent, branch: BranchInfo) => void;
}

export function BranchList({ title, entries, selectedName, onSelect, onCheckout, onContextMenu }: BranchListProps) {
  if (entries.length === 0) return null;
  return (
    <div class="branch-group">
      <div class="branch-group-title">{title}</div>
      {entries.map((entry) => (
        <BranchRow
          key={entry.branch.name}
          entry={entry}
          selected={entry.branch.name === selectedName}
          onClick={() => onSelect(entry.branch.name)}
          onDoubleClick={() => onCheckout(entry.branch)}
          onContextMenu={(e) => onContextMenu(e, entry.branch)}
        />
      ))}
    </div>
  );
}
