import type { CommitInfo } from './protocol';
import type { GraphRow } from './graphLayout';
import { GraphCell } from './GraphCell';
import { RefPill } from './RefPill';

interface CommitRowProps {
  commit: CommitInfo;
  graphRow: GraphRow;
  laneCount: number;
  isHead: boolean;
  selected: boolean;
  onContextMenu: (e: MouseEvent, sha: string) => void;
  onClick: (sha: string) => void;
}

export function CommitRow({ commit, graphRow, laneCount, isHead, selected, onContextMenu, onClick }: CommitRowProps) {
  return (
    <div
      class={`commit-row ${isHead ? 'is-head' : ''} ${selected ? 'selected' : ''}`}
      onContextMenu={(e) => onContextMenu(e, commit.sha)}
      onClick={() => onClick(commit.sha)}
    >
      <div class="commit-row-graph">
        <GraphCell row={graphRow} laneCount={laneCount} />
      </div>
      <div class="commit-row-subject" title={commit.subject}>
        {commit.refs.map((r) => (
          <RefPill key={r} raw={r} />
        ))}
        <span class={isHead ? 'subject-text bold' : 'subject-text'}>{commit.subject}</span>
      </div>
      <div class="commit-row-date" title={commit.author}>
        {commit.date}
      </div>
      <div class="commit-row-sha">{commit.shortSha}</div>
    </div>
  );
}
