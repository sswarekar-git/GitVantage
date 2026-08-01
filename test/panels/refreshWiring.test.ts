import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { _test } from '../mocks/vscode';
import { FakeRepoManager } from '../mocks/repoManager';
import { createTempRepo } from '../helpers/tempRepo';
import { CommitViewProvider } from '../../src/webviews/commit/CommitViewProvider';
import { StashViewProvider } from '../../src/webviews/stash/StashViewProvider';
import { LogViewProvider } from '../../src/webviews/log/LogViewProvider';
import { BranchesPanel } from '../../src/webviews/branches/BranchesPanel';

// Regression suite for the actual bug class hit in the field: a panel/provider
// that never learns the repo changed (a checkout/reset/revert/commit from
// elsewhere) and silently keeps showing stale data — indistinguishable from
// "the action failed" to a user, even though it succeeded. Every panel must
// subscribe to RepoManager.onDidChange and re-render when it fires. This
// caught BranchesPanel missing the subscription entirely before this suite
// even finished being written.

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CommitViewProvider refresh wiring', () => {
  it('subscribes to repo changes and re-posts state when they fire', async () => {
    const repoManager = new FakeRepoManager();
    const provider = new CommitViewProvider(vscode.Uri.file('/ext'), repoManager as never);
    expect(repoManager.listenerCount).toBeGreaterThan(0);

    const view = _test.makeFakeWebviewView();
    provider.resolveWebviewView(view as never);
    await flush();
    view.webview.postedMessages.length = 0;

    repoManager.fireChange();
    await flush();

    expect(view.webview.postedMessages.some((m: any) => m.type === 'state')).toBe(true);
  });
});

describe('StashViewProvider refresh wiring', () => {
  it('subscribes to repo changes and re-posts state when they fire', async () => {
    const repoManager = new FakeRepoManager();
    const provider = new StashViewProvider(vscode.Uri.file('/ext'), repoManager as never);
    expect(repoManager.listenerCount).toBeGreaterThan(0);

    const view = _test.makeFakeWebviewView();
    provider.resolveWebviewView(view as never);
    await flush();
    view.webview.postedMessages.length = 0;

    repoManager.fireChange();
    await flush();

    expect(view.webview.postedMessages.some((m: any) => m.type === 'state')).toBe(true);
  });
});

describe('LogViewProvider refresh wiring', () => {
  it('subscribes to repo changes and re-posts init (headSha) and branches when they fire', async () => {
    // Like BranchesPanel, pushBranches() shells out to real git (cli.listBranches),
    // so the fake repository needs a real directory backing it.
    const tempRepo = createTempRepo();
    const repoManager = new FakeRepoManager();
    repoManager.repository.rootUri = vscode.Uri.file(tempRepo.root);

    try {
      const provider = new LogViewProvider(vscode.Uri.file('/ext'), repoManager as never);
      expect(repoManager.listenerCount).toBeGreaterThan(0);

      const view = _test.makeFakeWebviewView();
      provider.resolveWebviewView(view as never);
      await flush();
      view.webview.postedMessages.length = 0;

      repoManager.fireChange();
      await vi.waitFor(() => {
        expect(view.webview.postedMessages.some((m: any) => m.type === 'init')).toBe(true);
        expect(view.webview.postedMessages.some((m: any) => m.type === 'branches')).toBe(true);
      });
    } finally {
      tempRepo.cleanup();
    }
  });
});

describe('BranchesPanel refresh wiring', () => {
  it('subscribes to repo changes and re-posts state when they fire', async () => {
    // Unlike the other three panels, BranchesPanel's refresh path shells out
    // to real git (cli.listBranches) rather than reading in-memory state, so
    // the fake repository needs a real directory backing it.
    const tempRepo = createTempRepo();
    const repoManager = new FakeRepoManager();
    repoManager.repository.rootUri = vscode.Uri.file(tempRepo.root);

    try {
      BranchesPanel.createOrShow(vscode.Uri.file('/ext'), repoManager as never);
      expect(repoManager.listenerCount).toBeGreaterThan(0);

      const calls = vi.mocked(vscode.window.createWebviewPanel).mock.results;
      const panel = calls[calls.length - 1].value;
      await flush();
      panel.webview.postedMessages.length = 0;

      repoManager.fireChange();
      // pushState() here shells out to a real git subprocess (cli.listBranches),
      // unlike the other three panels — a fixed zero-delay flush isn't a
      // reliable enough wait for real process I/O, so poll instead.
      await vi.waitFor(() => {
        expect(panel.webview.postedMessages.some((m: any) => m.type === 'state')).toBe(true);
      });
    } finally {
      tempRepo.cleanup();
    }
  });
});
