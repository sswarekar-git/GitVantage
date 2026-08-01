import * as vscode from 'vscode';
import { execGit, GitCommandError } from '../util/exec';
import type { BlameLine, BranchInfo, CommitInfo, DiffFile, LogPage, StashInfo } from './types';

const FS = '\x1f'; // field separator
const RS = '\x1e'; // record separator
const UNCOMMITTED_SHA = '0000000000000000000000000000000000000000';

export async function getHeadCommitMessage(repoRoot: string): Promise<string> {
  const { stdout } = await execGit(repoRoot, ['log', '-1', '--format=%B']);
  return stdout.trim();
}

// --line-porcelain repeats full commit metadata for every line (unlike plain
// --porcelain, which only emits it once per commit group) — costs a bit more
// output but makes parsing trivial: each line's block is self-contained, no
// carry-forward state needed between records.
export async function getBlame(repoRoot: string, relativePath: string): Promise<BlameLine[]> {
  const { stdout } = await execGit(repoRoot, ['blame', '--line-porcelain', '--', relativePath]);
  const lines = stdout.split('\n');
  const result: BlameLine[] = [];

  let sha = '';
  let author = '';
  let authorTime = 0;
  let summary = '';

  for (const line of lines) {
    if (/^[0-9a-f]{40} \d+ \d+/.test(line)) {
      sha = line.slice(0, 40);
    } else if (line.startsWith('author ')) {
      author = line.slice('author '.length);
    } else if (line.startsWith('author-time ')) {
      authorTime = parseInt(line.slice('author-time '.length), 10) || 0;
    } else if (line.startsWith('summary ')) {
      summary = line.slice('summary '.length);
    } else if (line.startsWith('\t')) {
      result.push({
        sha,
        author: sha === UNCOMMITTED_SHA ? 'Not Committed Yet' : author,
        authorTime,
        summary,
      });
    }
  }
  return result;
}

// Stage/unstage/commit/push go through our own git CLI layer rather than the
// built-in vscode.git extension's Repository.add/revert/commit/push — those
// have been observed to fail with "Failed to execute git" in some Extension
// Development Host environments even when this extension's own git spawns
// (using the same resolved binary) succeed.
export async function stageFiles(repoRoot: string, paths: string[]): Promise<void> {
  await execGit(repoRoot, ['add', '--', ...paths]);
}

export async function unstageFiles(repoRoot: string, paths: string[]): Promise<void> {
  await execGit(repoRoot, ['reset', '--', ...paths]);
}

export async function commitChanges(
  repoRoot: string,
  message: string,
  opts: { amend?: boolean } = {},
): Promise<void> {
  const args = ['commit', '-m', message];
  if (opts.amend) args.push('--amend');
  await execGit(repoRoot, args);
}

export async function pushCurrent(repoRoot: string): Promise<void> {
  try {
    await execGit(repoRoot, ['push']);
  } catch (err) {
    // A freshly connected remote has no upstream for the current branch yet —
    // retry once with -u instead of surfacing an error the user can't act on.
    if (err instanceof GitCommandError && /has no upstream branch/.test(err.stderr)) {
      const { stdout } = await execGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const branch = stdout.trim();
      const remotes = await listRemotes(repoRoot);
      const remote = remotes[0] ?? 'origin';
      await execGit(repoRoot, ['push', '-u', remote, branch]);
      return;
    }
    throw err;
  }
}

export async function getLogPage(
  repoRoot: string,
  opts: { skip: number; limit: number; branch?: string; filterText?: string; token?: vscode.CancellationToken },
): Promise<LogPage> {
  const format = `--pretty=format:%H${FS}%h${FS}%P${FS}%an${FS}%ad${FS}%s${FS}%D${RS}`;
  const args = [
    'log',
    opts.branch ?? '--all',
    `--skip=${opts.skip}`,
    `--max-count=${opts.limit + 1}`,
    '--date=relative',
    format,
  ];
  if (opts.filterText) {
    args.push(`--grep=${opts.filterText}`, '-i');
  }

  const { stdout } = await execGit(repoRoot, args, { token: opts.token });
  const records = stdout.split(RS).map((r) => r.trim()).filter(Boolean);

  const hasMore = records.length > opts.limit;
  const pageRecords = records.slice(0, opts.limit);

  const commits: CommitInfo[] = pageRecords.map((record) => {
    const [sha, shortSha, parentsRaw, author, date, subject, refsRaw] = record.split(FS);
    return {
      sha,
      shortSha,
      parents: parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [],
      author,
      date,
      subject,
      refs: refsRaw
        ? refsRaw.split(',').map((r) => r.trim()).filter(Boolean)
        : [],
    };
  });

  return { commits, hasMore, nextSkip: opts.skip + pageRecords.length };
}

export interface BranchTrackInfo {
  ahead: number;
  behind: number;
}

// %(upstream:track) yields '' (up to date), '[ahead N]', '[behind N]',
// '[ahead N, behind M]', or '[gone]' (upstream deleted, refs pruned) —
// verified against a real git repo rather than assumed from docs.
function parseUpstreamTrack(track: string): { ahead?: number; behind?: number; upstreamGone?: boolean } {
  if (!track) return {};
  if (track === '[gone]') return { upstreamGone: true };
  const aheadMatch = track.match(/ahead (\d+)/);
  const behindMatch = track.match(/behind (\d+)/);
  return {
    ahead: aheadMatch ? parseInt(aheadMatch[1], 10) : undefined,
    behind: behindMatch ? parseInt(behindMatch[1], 10) : undefined,
  };
}

export async function listBranches(repoRoot: string): Promise<BranchInfo[]> {
  // Use the full refname (not :short) so local vs. remote can be told apart by
  // prefix — branch names containing '/' (e.g. "feature/one") are indistinguishable
  // from remote-tracking names ("origin/main") once shortened, which would
  // misclassify perfectly ordinary local branches as remote.
  const format = `%(refname)${FS}%(HEAD)${FS}%(upstream:short)${FS}%(upstream:track)${FS}%(committerdate:relative)${FS}%(subject)${RS}`;
  const { stdout } = await execGit(repoRoot, [
    'for-each-ref',
    'refs/heads',
    'refs/remotes',
    `--format=${format}`,
  ]);

  const records = stdout.split(RS).map((r) => r.trim()).filter(Boolean);

  const branches: BranchInfo[] = [];
  for (const record of records) {
    const [fullRef, headMarker, upstream, track, date, subject] = record.split(FS);
    if (fullRef.endsWith('/HEAD')) continue; // skip origin/HEAD symbolic pointer

    let isRemote: boolean;
    let name: string;
    if (fullRef.startsWith('refs/heads/')) {
      isRemote = false;
      name = fullRef.slice('refs/heads/'.length);
    } else if (fullRef.startsWith('refs/remotes/')) {
      isRemote = true;
      name = fullRef.slice('refs/remotes/'.length);
    } else {
      continue;
    }

    branches.push({
      name,
      isRemote,
      isCurrent: headMarker === '*',
      upstream: upstream || undefined,
      lastCommitDate: date,
      lastCommitSubject: subject,
      ...parseUpstreamTrack(track),
    });
  }
  return branches;
}

export async function getAheadBehind(
  repoRoot: string,
  branch: string,
  upstream: string,
): Promise<BranchTrackInfo> {
  const { stdout } = await execGit(repoRoot, [
    'rev-list',
    '--left-right',
    '--count',
    `${branch}...${upstream}`,
  ]);
  const [ahead, behind] = stdout.trim().split('\t').map((n) => parseInt(n, 10) || 0);
  return { ahead, behind };
}

export async function listStashes(repoRoot: string): Promise<StashInfo[]> {
  let stdout: string;
  try {
    ({ stdout } = await execGit(repoRoot, [
      'stash',
      'list',
      `--format=%gd${FS}%s${FS}%ci${RS}`,
    ]));
  } catch {
    return [];
  }

  const records = stdout.split(RS).map((r) => r.trim()).filter(Boolean);
  return records.map((record, i) => {
    const [ref, message, date] = record.split(FS);
    const branchMatch = message.match(/^WIP on ([^:]+):/) ?? message.match(/^On ([^:]+):/);
    return {
      index: i,
      ref,
      message,
      branch: branchMatch ? branchMatch[1] : '',
      date,
    };
  });
}

export async function createStash(
  repoRoot: string,
  opts: { message?: string; keepIndex?: boolean; includeUntracked?: boolean },
): Promise<void> {
  const args = ['stash', 'push'];
  if (opts.keepIndex) args.push('--keep-index');
  if (opts.includeUntracked) args.push('--include-untracked');
  if (opts.message) args.push('-m', opts.message);
  await execGit(repoRoot, args);
}

export async function applyStash(repoRoot: string, ref: string): Promise<void> {
  await execGit(repoRoot, ['stash', 'apply', ref]);
}

export async function popStash(repoRoot: string, ref: string): Promise<void> {
  await execGit(repoRoot, ['stash', 'pop', ref]);
}

export async function dropStash(repoRoot: string, ref: string): Promise<void> {
  await execGit(repoRoot, ['stash', 'drop', ref]);
}

export async function getStashFiles(repoRoot: string, ref: string): Promise<{ path: string; status: string }[]> {
  // -u: stashes created with "include untracked" won't show those files in the
  // diffstat without this — without it we'd silently under-report what's stashed.
  const { stdout } = await execGit(repoRoot, ['stash', 'show', '--name-status', '-u', ref]);
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { status, path: rest.join('\t') };
    });
}

export async function checkoutBranch(repoRoot: string, name: string): Promise<void> {
  await execGit(repoRoot, ['checkout', name]);
}

// Checking out a remote-tracking ref directly (e.g. "origin/feature") leaves
// you in detached HEAD, so instead check out (or create) a local branch
// tracking it.
export async function checkoutRemoteTracking(repoRoot: string, remoteRef: string): Promise<void> {
  const localName = remoteRef.slice(remoteRef.indexOf('/') + 1);
  try {
    await execGit(repoRoot, ['checkout', localName]);
  } catch {
    await execGit(repoRoot, ['checkout', '-b', localName, remoteRef]);
  }
}

export async function createBranch(repoRoot: string, name: string, startPoint: string): Promise<void> {
  await execGit(repoRoot, ['checkout', '-b', name, startPoint]);
}

export async function deleteBranch(repoRoot: string, name: string, force = false): Promise<void> {
  await execGit(repoRoot, ['branch', force ? '-D' : '-d', name]);
}

export async function deleteRemoteBranch(repoRoot: string, remote: string, branchName: string): Promise<void> {
  await execGit(repoRoot, ['push', remote, '--delete', branchName]);
}

export async function fetchAll(repoRoot: string): Promise<void> {
  await execGit(repoRoot, ['fetch', '--all']);
}

export async function pull(repoRoot: string): Promise<void> {
  await execGit(repoRoot, ['pull']);
}

export async function listRemotes(repoRoot: string): Promise<string[]> {
  const { stdout } = await execGit(repoRoot, ['remote']);
  return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

export async function pruneRemote(repoRoot: string, remote: string): Promise<void> {
  await execGit(repoRoot, ['remote', 'prune', remote]);
}

export async function addRemote(repoRoot: string, name: string, url: string): Promise<void> {
  await execGit(repoRoot, ['remote', 'add', name, url]);
}

export async function renameBranch(repoRoot: string, oldName: string, newName: string): Promise<void> {
  await execGit(repoRoot, ['branch', '-m', oldName, newName]);
}

export async function mergeBranch(repoRoot: string, name: string): Promise<void> {
  await execGit(repoRoot, ['merge', name]);
}

export async function abortMerge(repoRoot: string): Promise<void> {
  await execGit(repoRoot, ['merge', '--abort']);
}

export async function rebaseOnto(repoRoot: string, name: string): Promise<void> {
  await execGit(repoRoot, ['rebase', name]);
}

export async function cherryPick(repoRoot: string, sha: string): Promise<void> {
  await execGit(repoRoot, ['cherry-pick', sha]);
}

// A conflicted or now-empty cherry-pick leaves CHERRY_PICK_HEAD set until the
// user explicitly resolves it — every subsequent `cherry-pick` call fails
// with "previous cherry-pick is now empty" until that state is cleared.
export async function cherryPickInProgress(repoRoot: string): Promise<boolean> {
  try {
    await execGit(repoRoot, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']);
    return true;
  } catch {
    return false;
  }
}

export async function abortCherryPick(repoRoot: string): Promise<void> {
  await execGit(repoRoot, ['cherry-pick', '--abort']);
}

export async function revertCommit(repoRoot: string, sha: string): Promise<void> {
  await execGit(repoRoot, ['revert', '--no-edit', sha]);
}

export async function resetTo(repoRoot: string, sha: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
  await execGit(repoRoot, ['reset', `--${mode}`, sha]);
}

export async function isBranchMerged(repoRoot: string, name: string): Promise<boolean> {
  const { stdout } = await execGit(repoRoot, ['branch', '--merged']);
  return stdout.split('\n').some((l) => l.trim().replace(/^\* /, '') === name);
}

// Diffs `from` against `to`, or against the working tree when `to` is omitted
// (matches `git diff`'s own single-ref semantics).
export async function diffNameStatus(repoRoot: string, from: string, to?: string): Promise<DiffFile[]> {
  const args = to ? ['diff', '--name-status', from, to] : ['diff', '--name-status', from];
  const { stdout } = await execGit(repoRoot, args);
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { status, path: rest.join('\t') };
    });
}

