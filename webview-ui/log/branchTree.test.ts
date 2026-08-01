import { describe, expect, it } from 'vitest';
import { buildBranchGroups } from './branchTree';
import type { BranchInfo } from './protocol';

function branch(overrides: Partial<BranchInfo> & { name: string; isRemote: boolean }): BranchInfo {
  return {
    isCurrent: false,
    lastCommitDate: '1 day ago',
    lastCommitSubject: 'subject',
    ...overrides,
  };
}

describe('buildBranchGroups', () => {
  it('nests local branches under their path segments', () => {
    const groups = buildBranchGroups([branch({ name: 'feature/one', isRemote: false })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('Local');
    expect(groups[0].nodes).toEqual([
      {
        kind: 'folder',
        name: 'feature',
        path: 'feature',
        children: [
          {
            kind: 'branch',
            name: 'one',
            path: 'feature/one',
            branch: expect.objectContaining({ name: 'feature/one' }),
          },
        ],
      },
    ]);
  });

  it('places a root-level local branch directly in the Local group', () => {
    const groups = buildBranchGroups([branch({ name: 'main', isRemote: false })]);
    expect(groups[0].nodes).toEqual([
      { kind: 'branch', name: 'main', path: 'main', branch: expect.objectContaining({ name: 'main' }) },
    ]);
  });

  it('groups remote branches by remote name, stripping the remote prefix from the nested path', () => {
    const groups = buildBranchGroups([
      branch({ name: 'origin/main', isRemote: true }),
      branch({ name: 'origin/feature/two', isRemote: true }),
    ]);
    const originGroup = groups.find((g) => g.remoteName === 'origin');
    expect(originGroup).toBeDefined();
    expect(originGroup!.title).toBe('origin');
    const names = originGroup!.nodes.map((n) => n.name).sort();
    expect(names).toEqual(['feature', 'main']);
  });

  it('splits branches across multiple distinct remotes into separate groups', () => {
    const groups = buildBranchGroups([
      branch({ name: 'origin/main', isRemote: true }),
      branch({ name: 'upstream/main', isRemote: true }),
    ]);
    const remoteTitles = groups.map((g) => g.title).sort();
    expect(remoteTitles).toEqual(['origin', 'upstream']);
  });

  it('sorts folders before branches, then alphabetically, within a group', () => {
    const groups = buildBranchGroups([
      branch({ name: 'zeta', isRemote: false }),
      branch({ name: 'alpha/inner', isRemote: false }),
      branch({ name: 'beta', isRemote: false }),
    ]);
    expect(groups[0].nodes.map((n) => n.name)).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('omits the Local group entirely when there are no local branches', () => {
    const groups = buildBranchGroups([branch({ name: 'origin/main', isRemote: true })]);
    expect(groups.find((g) => g.remoteName === undefined)).toBeUndefined();
  });
});
