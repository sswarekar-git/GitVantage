import { describe, expect, it } from 'vitest';
import { computeGraphLayout } from './graphLayout';
import type { CommitInfo } from './protocol';

function makeCommit(sha: string, parents: string[]): CommitInfo {
  return { sha, shortSha: sha.slice(0, 7), parents, author: 'a', date: 'now', subject: sha, refs: [] };
}

describe('computeGraphLayout', () => {
  it('keeps a linear history on a single lane', () => {
    const commits = [makeCommit('c3', ['c2']), makeCommit('c2', ['c1']), makeCommit('c1', [])];
    const { rows } = computeGraphLayout(commits);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
  });

  it('opens a new lane for a merge commit second parent', () => {
    // c3 merges c2b into mainline c2a
    const commits = [
      makeCommit('c3', ['c2a', 'c2b']),
      makeCommit('c2b', ['c1']),
      makeCommit('c2a', ['c1']),
      makeCommit('c1', []),
    ];
    const { rows } = computeGraphLayout(commits);
    const merge = rows[0];
    expect(merge.parentLanes.length).toBe(2);
    expect(merge.parentLanes[0]).toBe(merge.lane); // first parent continues mainline lane
    expect(merge.parentLanes[1]).not.toBe(merge.lane); // second parent gets its own lane
  });

  it('closes converging lanes at the shared ancestor', () => {
    const commits = [
      makeCommit('c3', ['c2a', 'c2b']),
      makeCommit('c2b', ['c1']),
      makeCommit('c2a', ['c1']),
      makeCommit('c1', []),
    ];
    const { rows } = computeGraphLayout(commits);
    const ancestorRow = rows.find((r) => r.sha === 'c1')!;
    // both branch lanes should have been pointing at c1, so one of them
    // shows up as a "closedLanes" convergence into the shared ancestor
    expect(ancestorRow.closedLanes.length).toBe(1);
  });

  it('carries lane assignment across a paginated second call', () => {
    const page1 = [makeCommit('c2', ['c1'])];
    const { rows: rows1, laneState } = computeGraphLayout(page1);
    expect(rows1[0].lane).toBe(0);

    const page2 = [makeCommit('c1', ['c0'])];
    const { rows: rows2 } = computeGraphLayout(page2, laneState);
    // c1 was the lane c2 was waiting for — must continue the same lane, not open a new one
    expect(rows2[0].lane).toBe(0);
  });

  it('gives a root commit (no parents) no outgoing parent lanes', () => {
    const commits = [makeCommit('c1', [])];
    const { rows } = computeGraphLayout(commits);
    expect(rows[0].parentLanes).toEqual([]);
  });

  it('gives two simultaneously-open branch tips separate lanes', () => {
    // tipA's lane stays occupied (waiting for "base") when tipB — an
    // unrelated tip — is processed, so it must not reuse tipA's lane.
    const commits = [makeCommit('tipA', ['base']), makeCommit('tipB', ['base2']), makeCommit('base', [])];
    const { rows } = computeGraphLayout(commits);
    const [tipARow, tipBRow] = rows;
    expect(tipARow.lane).not.toBe(tipBRow.lane);
  });

  it('reuses a lane freed by a terminated root commit for the next unrelated tip', () => {
    const commits = [makeCommit('a1', []), makeCommit('b1', [])];
    const { rows } = computeGraphLayout(commits);
    // a1 has no parent, so its lane closes immediately — b1 is free to reuse it.
    expect(rows[0].lane).toBe(rows[1].lane);
  });
});
