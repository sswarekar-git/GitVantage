import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { _test } from '../mocks/vscode';
import { FakeRepoManager } from '../mocks/repoManager';
import { CommitViewProvider } from '../../src/webviews/commit/CommitViewProvider';
import { StashViewProvider } from '../../src/webviews/stash/StashViewProvider';
import { LogViewProvider } from '../../src/webviews/log/LogViewProvider';
import { BranchesPanel } from '../../src/webviews/branches/BranchesPanel';

// Regression suite for the bug where an empty workspace (no git repo yet)
// left every view silently stuck — the provider just returned early instead
// of telling the webview there's genuinely no repository, so Commit's
// webview sat on "Loading…" forever and Log/Stash/Branches showed a
// misleading "nothing here" message instead of "no repository at all".

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function emptyRepoManager(): FakeRepoManager {
  const repoManager = new FakeRepoManager();
  repoManager.gitApi.repositories.length = 0;
  return repoManager;
}

describe('CommitViewProvider initRepository / cloneRepository', () => {
  it('delegates to the built-in git.init and git.clone commands', async () => {
    const repoManager = emptyRepoManager();
    const provider = new CommitViewProvider(vscode.Uri.file('/ext'), repoManager as never);
    const view = _test.makeFakeWebviewView();
    provider.resolveWebviewView(view as never);
    vi.mocked(vscode.commands.executeCommand).mockClear();

    view.webview.simulateMessage({ type: 'initRepository' });
    await flush();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('git.init');

    view.webview.simulateMessage({ type: 'cloneRepository' });
    await flush();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('git.clone');
  });
});

describe('noRepository signaling', () => {
  it('CommitViewProvider posts noRepository when there is no active repository', async () => {
    const repoManager = emptyRepoManager();
    const provider = new CommitViewProvider(vscode.Uri.file('/ext'), repoManager as never);
    const view = _test.makeFakeWebviewView();
    provider.resolveWebviewView(view as never);

    view.webview.simulateMessage({ type: 'ready' });
    await flush();

    expect(view.webview.postedMessages.some((m: any) => m.type === 'noRepository')).toBe(true);
    expect(view.webview.postedMessages.some((m: any) => m.type === 'state')).toBe(false);
  });

  it('StashViewProvider posts noRepository when there is no active repository', async () => {
    const repoManager = emptyRepoManager();
    const provider = new StashViewProvider(vscode.Uri.file('/ext'), repoManager as never);
    const view = _test.makeFakeWebviewView();
    provider.resolveWebviewView(view as never);

    view.webview.simulateMessage({ type: 'ready' });
    await flush();

    expect(view.webview.postedMessages.some((m: any) => m.type === 'noRepository')).toBe(true);
  });

  it('LogViewProvider posts noRepository when there is no active repository', async () => {
    const repoManager = emptyRepoManager();
    const provider = new LogViewProvider(vscode.Uri.file('/ext'), repoManager as never);
    const view = _test.makeFakeWebviewView();
    provider.resolveWebviewView(view as never);

    view.webview.simulateMessage({ type: 'ready' });
    await flush();

    expect(view.webview.postedMessages.some((m: any) => m.type === 'noRepository')).toBe(true);
    expect(view.webview.postedMessages.some((m: any) => m.type === 'init')).toBe(false);
  });

  it('BranchesPanel posts noRepository when there is no active repository', async () => {
    const repoManager = emptyRepoManager();
    BranchesPanel.createOrShow(vscode.Uri.file('/ext'), repoManager as never);
    const panel = vi.mocked(vscode.window.createWebviewPanel).mock.results[0].value;

    panel.webview.simulateMessage({ type: 'ready' });
    await flush();

    expect(panel.webview.postedMessages.some((m: any) => m.type === 'noRepository')).toBe(true);
    panel.simulateDispose();
  });
});
