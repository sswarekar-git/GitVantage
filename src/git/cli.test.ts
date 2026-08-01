import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBareRepo, createTempRepo, type TempRepo } from '../../test/helpers/tempRepo';
import * as cli from './cli';

let repo: TempRepo;

beforeEach(() => {
  repo = createTempRepo();
});

afterEach(() => {
  repo.cleanup();
});

function commit(repo: TempRepo, file: string, content: string, message: string): string {
  repo.write(file, content);
  repo.git('add', file);
  repo.git('commit', '-q', '-m', message);
  return repo.git('rev-parse', 'HEAD').trim();
}

describe('stageFiles / unstageFiles / commitChanges', () => {
  it('stages and commits a new file', async () => {
    repo.write('a.txt', 'hello\n');
    await cli.stageFiles(repo.root, ['a.txt']);
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('a.txt');

    await cli.commitChanges(repo.root, 'feat: add a.txt');
    expect(repo.git('log', '-1', '--format=%s').trim()).toBe('feat: add a.txt');
    expect(repo.git('status', '--porcelain').trim()).toBe('');
  });

  it('unstages a file without discarding the edit', async () => {
    commit(repo, 'a.txt', 'v1\n', 'chore: initial');
    repo.write('a.txt', 'v2\n');
    await cli.stageFiles(repo.root, ['a.txt']);
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('a.txt');

    await cli.unstageFiles(repo.root, ['a.txt']);
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('');
    expect(repo.git('diff', '--name-only').trim()).toBe('a.txt');
  });

  it('splits subject/body correctly and amends without creating a new commit', async () => {
    commit(repo, 'a.txt', 'v1\n', 'chore: initial');
    const countBefore = repo.git('rev-list', '--count', 'HEAD').trim();

    repo.write('a.txt', 'v2\n');
    await cli.stageFiles(repo.root, ['a.txt']);
    await cli.commitChanges(repo.root, 'chore: initial\n\namended body', { amend: true });

    const countAfter = repo.git('rev-list', '--count', 'HEAD').trim();
    expect(countAfter).toBe(countBefore);
    expect(repo.git('log', '-1', '--format=%B').trim()).toBe('chore: initial\n\namended body');
  });
});

describe('getLogPage', () => {
  it('pages newest-first and reports hasMore correctly', async () => {
    for (let i = 0; i < 5; i++) commit(repo, 'a.txt', `v${i}\n`, `commit ${i}`);

    const page1 = await cli.getLogPage(repo.root, { skip: 0, limit: 3 });
    expect(page1.commits.map((c) => c.subject)).toEqual(['commit 4', 'commit 3', 'commit 2']);
    expect(page1.hasMore).toBe(true);

    const page2 = await cli.getLogPage(repo.root, { skip: 3, limit: 3 });
    expect(page2.commits.map((c) => c.subject)).toEqual(['commit 1', 'commit 0']);
    expect(page2.hasMore).toBe(false);
  });

  it('reports parents and ref pills', async () => {
    const first = commit(repo, 'a.txt', 'v1\n', 'first');
    commit(repo, 'a.txt', 'v2\n', 'second');

    const page = await cli.getLogPage(repo.root, { skip: 0, limit: 10 });
    const second = page.commits[0];
    expect(second.parents).toEqual([first]);
    expect(second.refs.some((r) => r.includes('main'))).toBe(true);
  });

  it('filters by grep text', async () => {
    commit(repo, 'a.txt', 'v1\n', 'feat: alpha');
    commit(repo, 'a.txt', 'v2\n', 'fix: beta');

    const page = await cli.getLogPage(repo.root, { skip: 0, limit: 10, filterText: 'alpha' });
    expect(page.commits.map((c) => c.subject)).toEqual(['feat: alpha']);
  });

  it('restricts to current branch when branch=HEAD', async () => {
    commit(repo, 'a.txt', 'v1\n', 'on main');
    repo.git('checkout', '-q', '-b', 'feature');
    commit(repo, 'b.txt', 'v1\n', 'on feature');
    repo.git('checkout', '-q', 'main');

    const page = await cli.getLogPage(repo.root, { skip: 0, limit: 10, branch: 'HEAD' });
    expect(page.commits.map((c) => c.subject)).not.toContain('on feature');
  });
});

describe('listBranches', () => {
  it('classifies local branches with slashes as local, not remote (regression)', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.git('branch', 'feature/one');
    repo.git('branch', 'feature/two');

    const branches = await cli.listBranches(repo.root);
    const featureOne = branches.find((b) => b.name === 'feature/one');
    const featureTwo = branches.find((b) => b.name === 'feature/two');

    expect(featureOne).toBeDefined();
    expect(featureOne!.isRemote).toBe(false);
    expect(featureTwo!.isRemote).toBe(false);
  });

  it('classifies remote-tracking refs as remote', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);
    repo.git('push', '-q', 'origin', 'main');
    repo.git('fetch', '-q', 'origin');

    const branches = await cli.listBranches(repo.root);
    const originMain = branches.find((b) => b.name === 'origin/main');
    expect(originMain).toBeDefined();
    expect(originMain!.isRemote).toBe(true);

    remote.cleanup();
  });

  it('marks the checked-out branch as current', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.git('branch', 'other');

    const branches = await cli.listBranches(repo.root);
    expect(branches.find((b) => b.name === 'main')!.isCurrent).toBe(true);
    expect(branches.find((b) => b.name === 'other')!.isCurrent).toBe(false);
  });

  it('reports ahead/behind for every branch with an upstream, not just the current one', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);
    repo.git('branch', 'feature');
    repo.git('push', '-q', 'origin', 'main', 'feature');
    repo.git('branch', '--set-upstream-to=origin/main', 'main');
    repo.git('branch', '--set-upstream-to=origin/feature', 'feature');
    // Advance `feature` locally without touching `main` or checking it out —
    // ahead/behind must show up for feature even though main is current.
    repo.git('checkout', '-q', 'feature');
    commit(repo, 'a.txt', 'v2\n', 'feature work');
    repo.git('checkout', '-q', 'main');

    const branches = await cli.listBranches(repo.root);
    const feature = branches.find((b) => b.name === 'feature')!;
    const main = branches.find((b) => b.name === 'main')!;
    expect(feature.ahead).toBe(1);
    expect(feature.behind).toBeUndefined();
    expect(main.ahead).toBeUndefined();
    expect(main.behind).toBeUndefined();

    remote.cleanup();
  });

  it('flags a branch whose upstream was deleted and pruned as gone', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);
    repo.git('branch', 'feature');
    repo.git('push', '-q', 'origin', 'main', 'feature');
    repo.git('branch', '--set-upstream-to=origin/feature', 'feature');
    remote.git('branch', '-D', 'feature');
    repo.git('fetch', '-q', 'origin', '--prune');

    const branches = await cli.listBranches(repo.root);
    expect(branches.find((b) => b.name === 'feature')!.upstreamGone).toBe(true);

    remote.cleanup();
  });
});

describe('deleteRemoteBranch', () => {
  it('deletes the branch on the actual remote', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);
    repo.git('branch', 'feature');
    repo.git('push', '-q', 'origin', 'main', 'feature');

    await cli.deleteRemoteBranch(repo.root, 'origin', 'feature');
    expect(remote.git('branch').includes('feature')).toBe(false);

    remote.cleanup();
  });
});

describe('fetchAll / pull', () => {
  it('fetchAll pulls new remote-tracking refs without touching the working tree', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);
    repo.git('push', '-q', 'origin', 'main');
    remote.git('branch', 'feature');

    await cli.fetchAll(repo.root);
    const branches = await cli.listBranches(repo.root);
    expect(branches.some((b) => b.name === 'origin/feature')).toBe(true);

    remote.cleanup();
  });

  it('pull fast-forwards the current branch from its upstream', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);
    repo.git('push', '-q', 'origin', 'main');
    repo.git('branch', '--set-upstream-to=origin/main', 'main');

    // Simulate someone else pushing a new commit: a second local repo synced
    // to the same remote history, advanced independently, then pushed.
    const other = createTempRepo();
    other.git('remote', 'add', 'origin', remote.root);
    other.git('fetch', '-q', 'origin');
    other.git('reset', '-q', '--hard', 'origin/main');
    other.write('a.txt', 'v2\n');
    other.git('add', 'a.txt');
    other.git('commit', '-q', '-m', 'from elsewhere');
    other.git('push', '-q', 'origin', 'main');

    await cli.pull(repo.root);
    expect(repo.git('log', '-1', '--format=%s').trim()).toBe('from elsewhere');

    other.cleanup();
    remote.cleanup();
  });
});

describe('listRemotes / pruneRemote', () => {
  it('lists configured remote names', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);

    expect(await cli.listRemotes(repo.root)).toEqual(['origin']);

    remote.cleanup();
  });

  it('removes stale remote-tracking refs for branches deleted on the remote', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);
    repo.git('branch', 'feature');
    repo.git('push', '-q', 'origin', 'main', 'feature');
    repo.git('fetch', '-q', 'origin');
    remote.git('branch', '-D', 'feature');

    let branches = await cli.listBranches(repo.root);
    expect(branches.some((b) => b.name === 'origin/feature')).toBe(true);

    await cli.pruneRemote(repo.root, 'origin');
    branches = await cli.listBranches(repo.root);
    expect(branches.some((b) => b.name === 'origin/feature')).toBe(false);

    remote.cleanup();
  });
});

describe('branch mutation commands', () => {
  it('checkoutBranch switches HEAD', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.git('branch', 'other');
    await cli.checkoutBranch(repo.root, 'other');
    expect(repo.git('branch', '--show-current').trim()).toBe('other');
  });

  it('createBranch creates and checks out from a start point', async () => {
    const sha = commit(repo, 'a.txt', 'v1\n', 'initial');
    commit(repo, 'a.txt', 'v2\n', 'second');
    await cli.createBranch(repo.root, 'from-first', sha);
    expect(repo.git('branch', '--show-current').trim()).toBe('from-first');
    expect(repo.git('rev-parse', 'HEAD').trim()).toBe(sha);
  });

  it('deleteBranch removes a merged branch; force-deletes an unmerged one', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.git('branch', 'merged-branch');
    await cli.deleteBranch(repo.root, 'merged-branch', false);
    expect(repo.git('branch').includes('merged-branch')).toBe(false);

    repo.git('checkout', '-q', '-b', 'unmerged-branch');
    commit(repo, 'b.txt', 'v1\n', 'unique commit');
    repo.git('checkout', '-q', 'main');
    await expect(cli.deleteBranch(repo.root, 'unmerged-branch', false)).rejects.toThrow();
    await cli.deleteBranch(repo.root, 'unmerged-branch', true);
    expect(repo.git('branch').includes('unmerged-branch')).toBe(false);
  });

  it('renameBranch renames', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.git('branch', 'old-name');
    await cli.renameBranch(repo.root, 'old-name', 'new-name');
    expect(repo.git('branch').includes('new-name')).toBe(true);
    expect(repo.git('branch').includes('old-name')).toBe(false);
  });

  it('isBranchMerged reflects actual merge state', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.git('branch', 'merged-branch');
    expect(await cli.isBranchMerged(repo.root, 'merged-branch')).toBe(true);

    repo.git('checkout', '-q', '-b', 'unmerged-branch');
    commit(repo, 'b.txt', 'v1\n', 'unique commit');
    repo.git('checkout', '-q', 'main');
    expect(await cli.isBranchMerged(repo.root, 'unmerged-branch')).toBe(false);
  });

  it('checkoutRemoteTracking creates a local tracking branch', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);
    repo.git('push', '-q', 'origin', 'main');
    repo.git('checkout', '-q', '-b', 'feature');
    commit(repo, 'b.txt', 'v1\n', 'feature work');
    repo.git('push', '-q', 'origin', 'feature');
    repo.git('checkout', '-q', 'main');
    repo.git('branch', '-D', 'feature');
    repo.git('fetch', '-q', 'origin');

    await cli.checkoutRemoteTracking(repo.root, 'origin/feature');
    expect(repo.git('branch', '--show-current').trim()).toBe('feature');

    remote.cleanup();
  });
});

describe('mergeBranch / abortMerge', () => {
  it('merges a fast-forwardable branch', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.git('checkout', '-q', '-b', 'feature');
    commit(repo, 'b.txt', 'v1\n', 'feature work');
    repo.git('checkout', '-q', 'main');

    await cli.mergeBranch(repo.root, 'feature');
    expect(repo.git('log', '-1', '--format=%s').trim()).toBe('feature work');
  });

  it('abortMerge cleans up a conflicted merge', async () => {
    commit(repo, 'a.txt', 'line1\n', 'initial');
    repo.git('checkout', '-q', '-b', 'feature');
    commit(repo, 'a.txt', 'line1\nfeature change\n', 'feature edit');
    repo.git('checkout', '-q', 'main');
    commit(repo, 'a.txt', 'line1\nmain change\n', 'main edit');

    expect(() => repo.git('merge', 'feature')).toThrow();
    expect(repo.git('status', '--porcelain=v2').includes('u ')).toBe(true);

    await cli.abortMerge(repo.root);
    expect(repo.git('status', '--porcelain').trim()).toBe('');
  });
});

describe('cherryPick / revertCommit', () => {
  it('cherryPick applies a commit onto the current branch', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.git('checkout', '-q', '-b', 'feature');
    const featureSha = commit(repo, 'b.txt', 'v1\n', 'feature commit');
    repo.git('checkout', '-q', 'main');

    await cli.cherryPick(repo.root, featureSha);
    expect(repo.git('log', '-1', '--format=%s').trim()).toBe('feature commit');
    expect(repo.git('log', '--format=%s').includes('feature commit')).toBe(true);
  });

  it('revertCommit creates an inverse commit', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    const toRevert = commit(repo, 'a.txt', 'v2\n', 'change content');

    await cli.revertCommit(repo.root, toRevert);
    expect(repo.git('log', '-1', '--format=%s').trim()).toContain('Revert');
    expect(repo.git('show', 'HEAD:a.txt')).toBe('v1\n');
  });
});

describe('resetTo', () => {
  it('soft reset moves the branch ref but keeps the working tree and index', async () => {
    const first = commit(repo, 'a.txt', 'v1\n', 'first');
    commit(repo, 'a.txt', 'v2\n', 'second');

    await cli.resetTo(repo.root, first, 'soft');
    expect(repo.git('rev-parse', 'HEAD').trim()).toBe(first);
    // soft reset re-stages the diff between old and new HEAD
    expect(repo.git('diff', '--cached', '--name-only').trim()).toBe('a.txt');
    expect(repo.git('show', ':a.txt')).toBe('v2\n');
  });

  it('hard reset discards uncommitted changes entirely', async () => {
    const first = commit(repo, 'a.txt', 'v1\n', 'first');
    commit(repo, 'a.txt', 'v2\n', 'second');
    repo.write('a.txt', 'uncommitted\n');

    await cli.resetTo(repo.root, first, 'hard');
    expect(repo.git('rev-parse', 'HEAD').trim()).toBe(first);
    expect(repo.git('status', '--porcelain').trim()).toBe('');
    expect(repo.git('show', 'HEAD:a.txt')).toBe('v1\n');
  });
});

describe('diffNameStatus (regression: merge commits)', () => {
  it('diffs a normal commit against its parent', async () => {
    const first = commit(repo, 'a.txt', 'v1\n', 'first');
    const second = commit(repo, 'a.txt', 'v2\n', 'second');

    const files = await cli.diffNameStatus(repo.root, first, second);
    expect(files).toEqual([{ status: 'M', path: 'a.txt' }]);
  });

  it('diffs a root commit against the empty tree', async () => {
    const root = commit(repo, 'a.txt', 'v1\n', 'root');
    const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
    const files = await cli.diffNameStatus(repo.root, EMPTY_TREE_SHA, root);
    expect(files).toEqual([{ status: 'A', path: 'a.txt' }]);
  });

  it('diffs a merge commit against its first parent (git diff-tree would wrongly show nothing here)', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.git('checkout', '-q', '-b', 'feature');
    commit(repo, 'a.txt', 'v2\n', 'feature change');
    repo.git('checkout', '-q', 'main');
    repo.git('merge', '--no-ff', '-m', 'merge feature', 'feature');
    const mergeSha = repo.git('rev-parse', 'HEAD').trim();
    const firstParent = repo.git('rev-parse', `${mergeSha}^1`).trim();

    const files = await cli.diffNameStatus(repo.root, firstParent, mergeSha);
    expect(files).toEqual([{ status: 'M', path: 'a.txt' }]);
  });
});

describe('stash operations', () => {
  it('creates, lists, applies, and drops a stash', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.write('a.txt', 'v2\n');

    await cli.createStash(repo.root, { message: 'my stash' });
    expect(repo.git('status', '--porcelain').trim()).toBe('');

    const stashes = await cli.listStashes(repo.root);
    expect(stashes).toHaveLength(1);
    expect(stashes[0].message).toContain('my stash');

    await cli.applyStash(repo.root, stashes[0].ref);
    expect(repo.git('diff', '--name-only').trim()).toBe('a.txt');

    await cli.dropStash(repo.root, stashes[0].ref);
    expect(await cli.listStashes(repo.root)).toHaveLength(0);
  });

  it('pop removes the stash after applying', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.write('a.txt', 'v2\n');
    await cli.createStash(repo.root, {});

    const [stash] = await cli.listStashes(repo.root);
    await cli.popStash(repo.root, stash.ref);

    expect(repo.git('diff', '--name-only').trim()).toBe('a.txt');
    expect(await cli.listStashes(repo.root)).toHaveLength(0);
  });

  it('includeUntracked captures new files, and getStashFiles reports them', async () => {
    commit(repo, 'a.txt', 'v1\n', 'initial');
    repo.write('new.txt', 'brand new\n');

    await cli.createStash(repo.root, { includeUntracked: true });
    expect(repo.git('status', '--porcelain').trim()).toBe('');

    const [stash] = await cli.listStashes(repo.root);
    const files = await cli.getStashFiles(repo.root, stash.ref);
    expect(files.some((f) => f.path === 'new.txt')).toBe(true);
  });
});

describe('getBlame', () => {
  it('attributes each line to the commit that introduced it', async () => {
    commit(repo, 'a.txt', 'line1\n', 'add line1');
    commit(repo, 'a.txt', 'line1\nline2\n', 'add line2');

    const blame = await cli.getBlame(repo.root, 'a.txt');
    expect(blame).toHaveLength(2);
    expect(blame[0].summary).toBe('add line1');
    expect(blame[1].summary).toBe('add line2');
    expect(blame[0].author).toBe('GitPeak Test');
  });

  it('marks uncommitted lines distinctly', async () => {
    commit(repo, 'a.txt', 'line1\n', 'add line1');
    repo.write('a.txt', 'line1\nline2 uncommitted\n');

    const blame = await cli.getBlame(repo.root, 'a.txt');
    expect(blame[1].author).toBe('Not Committed Yet');
  });
});

describe('getHeadCommitMessage', () => {
  it('returns the full multi-line message of HEAD', async () => {
    repo.write('a.txt', 'v1\n');
    repo.git('add', 'a.txt');
    repo.git('commit', '-q', '-m', 'subject line\n\nbody line');

    expect(await cli.getHeadCommitMessage(repo.root)).toBe('subject line\n\nbody line');
  });
});

describe('getAheadBehind', () => {
  it('reports commits unique to each side', async () => {
    commit(repo, 'a.txt', 'v1\n', 'shared');
    const remote = createBareRepo();
    repo.git('remote', 'add', 'origin', remote.root);
    repo.git('push', '-q', 'origin', 'main');

    commit(repo, 'a.txt', 'v2\n', 'local only');
    repo.git('fetch', '-q', 'origin');

    const track = await cli.getAheadBehind(repo.root, 'main', 'origin/main');
    expect(track.ahead).toBe(1);
    expect(track.behind).toBe(0);

    remote.cleanup();
  });
});
