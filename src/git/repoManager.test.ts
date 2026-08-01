import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { findRepositoryForFile, toRepoSummary } from './repoManager';
import type { Repository } from './vscodeGitTypes';

function fakeRepo(rootPath: string): Repository {
  return { rootUri: vscode.Uri.file(rootPath) } as Repository;
}

describe('findRepositoryForFile', () => {
  it('matches a file inside the single repo', () => {
    const repo = fakeRepo('/work/repo');
    expect(findRepositoryForFile([repo], vscode.Uri.file('/work/repo/src/a.ts'))).toBe(repo);
  });

  it('matches the file that is exactly the repo root', () => {
    const repo = fakeRepo('/work/repo');
    expect(findRepositoryForFile([repo], vscode.Uri.file('/work/repo'))).toBe(repo);
  });

  it('picks the correct repo among several by path prefix', () => {
    const repoA = fakeRepo('/work/repoA');
    const repoB = fakeRepo('/work/repoB');
    expect(findRepositoryForFile([repoA, repoB], vscode.Uri.file('/work/repoB/src/a.ts'))).toBe(repoB);
  });

  it('does not misclassify a sibling folder with a similar name prefix', () => {
    const repo = fakeRepo('/work/repo');
    const repoOther = fakeRepo('/work/repo-other');
    expect(findRepositoryForFile([repo, repoOther], vscode.Uri.file('/work/repo-other/a.ts'))).toBe(repoOther);
  });

  it('picks the more specific (inner) repo when one is nested inside another', () => {
    const outer = fakeRepo('/work/outer');
    const inner = fakeRepo('/work/outer/inner');
    expect(findRepositoryForFile([outer, inner], vscode.Uri.file('/work/outer/inner/a.ts'))).toBe(inner);
    expect(findRepositoryForFile([outer, inner], vscode.Uri.file('/work/outer/a.ts'))).toBe(outer);
  });

  it('returns undefined for a file outside any known repo', () => {
    const repo = fakeRepo('/work/repo');
    expect(findRepositoryForFile([repo], vscode.Uri.file('/elsewhere/a.ts'))).toBeUndefined();
  });

  it('returns undefined when there are no repositories', () => {
    expect(findRepositoryForFile([], vscode.Uri.file('/work/repo/a.ts'))).toBeUndefined();
  });
});

describe('toRepoSummary', () => {
  it('derives the display name from the last path segment', () => {
    expect(toRepoSummary(fakeRepo('/Users/dev/projects/my-repo'))).toEqual({
      name: 'my-repo',
      rootPath: '/Users/dev/projects/my-repo',
    });
  });
});
