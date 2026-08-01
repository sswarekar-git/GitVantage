import type { RepoSummary } from './types';

interface RepoSelectProps {
  repos: RepoSummary[];
  activeRepoRoot: string | undefined;
  onChange: (rootPath: string) => void;
}

// Renders nothing at all in the common single-repo case — only shows up once
// a workspace actually has more than one repo for GitVantage to switch between.
export function RepoSelect({ repos, activeRepoRoot, onChange }: RepoSelectProps) {
  if (repos.length <= 1) return null;
  return (
    <select
      class="repo-select"
      value={activeRepoRoot}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
    >
      {repos.map((r) => (
        <option key={r.rootPath} value={r.rootPath}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
