import type { CommitInfo } from './protocol';
import { RefPill } from './RefPill';

interface CommitDetailsProps {
  commit: CommitInfo;
  onClose: () => void;
}

export function CommitDetails({ commit, onClose }: CommitDetailsProps) {
  return (
    <div class="commit-details">
      <div class="commit-details-header">
        <div class="commit-details-subject" title={commit.subject}>
          {commit.refs.map((r) => (
            <RefPill key={r} raw={r} />
          ))}
          {commit.subject}
        </div>
        <span class="codicon codicon-close commit-details-close" onClick={onClose} title="Close"></span>
      </div>
      <div class="commit-details-meta">
        <span>{commit.author}</span>
        <span>{commit.date}</span>
        <span class="commit-details-sha">{commit.shortSha}</span>
      </div>
    </div>
  );
}
