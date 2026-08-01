import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { _test } from '../mocks/vscode';
import { FakeRepoManager } from '../mocks/repoManager';
import { createBareRepo, createTempRepo, type TempRepo } from '../helpers/tempRepo';
import { LogViewProvider } from '../../src/webviews/log/LogViewProvider';

function commit(repo: TempRepo, file: string, content: string, message: string): void {
  repo.write(file, content);
  repo.git('add', file);
  repo.git('commit', '-q', '-m', message);
}

function setup(tempRepo: TempRepo) {
  const repoManager = new FakeRepoManager();
  repoManager.repository.rootUri = vscode.Uri.file(tempRepo.root);
  const provider = new LogViewProvider(vscode.Uri.file('/ext'), repoManager as never);
  const view = _test.makeFakeWebviewView();
  provider.resolveWebviewView(view as never);
  return { provider, view, repoManager };
}

describe('LogViewProvider message handling', () => {
  it('resolves a requestLogPage request with the commit history', async () => {
    const tempRepo = createTempRepo();
    try {
      commit(tempRepo, 'a.txt', 'v1\n', 'initial');
      const { view } = setup(tempRepo);
      view.webview.postedMessages.length = 0;

      view.webview.simulateMessage({
        type: 'requestLogPage',
        payload: { skip: 0, limit: 50, branchScope: 'all' },
        requestId: 'req-1',
      });

      await vi.waitFor(() => {
        const reply: any = view.webview.postedMessages.find((m: any) => m.type === 'logPage');
        expect(reply?.payload.commits[0]?.subject).toBe('initial');
      });
    } finally {
      tempRepo.cleanup();
    }
  });

  it('resolves a requestCommitFiles request with the changed files', async () => {
    const tempRepo = createTempRepo();
    try {
      commit(tempRepo, 'a.txt', 'v1\n', 'initial');
      const sha = tempRepo.git('rev-parse', 'HEAD').trim();
      const { view } = setup(tempRepo);
      view.webview.postedMessages.length = 0;

      view.webview.simulateMessage({
        type: 'requestCommitFiles',
        payload: { sha, parentSha: undefined },
        requestId: 'req-2',
      });

      await vi.waitFor(() => {
        const reply: any = view.webview.postedMessages.find((m: any) => m.type === 'commitFiles');
        expect(reply?.payload.files).toEqual([{ status: 'A', path: 'a.txt' }]);
      });
    } finally {
      tempRepo.cleanup();
    }
  });

  it('checks out a branch via commitAction', async () => {
    const tempRepo = createTempRepo();
    try {
      commit(tempRepo, 'a.txt', 'v1\n', 'initial');
      tempRepo.git('branch', 'other');
      const otherSha = tempRepo.git('rev-parse', 'other').trim();
      const { view } = setup(tempRepo);

      view.webview.simulateMessage({ type: 'commitAction', payload: { sha: otherSha, action: 'checkout' } });

      await vi.waitFor(() => {
        expect(tempRepo.git('rev-parse', 'HEAD').trim()).toBe(otherSha);
      });
    } finally {
      tempRepo.cleanup();
    }
  });

  it('pushes local/remote branches and checks one out via branchAction', async () => {
    const tempRepo = createTempRepo();
    try {
      commit(tempRepo, 'a.txt', 'v1\n', 'initial');
      tempRepo.git('branch', 'feature');
      const { view } = setup(tempRepo);
      view.webview.postedMessages.length = 0;

      view.webview.simulateMessage({ type: 'requestBranches' });
      await vi.waitFor(() => {
        const reply: any = view.webview.postedMessages.find((m: any) => m.type === 'branches');
        expect(reply?.payload.branches.map((b: any) => b.name)).toEqual(expect.arrayContaining(['main', 'feature']));
      });

      view.webview.simulateMessage({
        type: 'branchAction',
        payload: { name: 'feature', isRemote: false, action: 'checkout' },
      });

      await vi.waitFor(() => {
        expect(tempRepo.git('branch', '--show-current').trim()).toBe('feature');
      });
    } finally {
      tempRepo.cleanup();
    }
  });

  it('deletes a remote branch on the actual remote via branchAction, bypassing the confirmation dialog', async () => {
    const tempRepo = createTempRepo();
    const remote = createBareRepo();
    try {
      commit(tempRepo, 'a.txt', 'v1\n', 'initial');
      tempRepo.git('remote', 'add', 'origin', remote.root);
      tempRepo.git('branch', 'feature');
      tempRepo.git('push', '-q', 'origin', 'main', 'feature');
      tempRepo.git('fetch', '-q', 'origin');
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Delete on Remote' as never);

      const { view } = setup(tempRepo);
      view.webview.simulateMessage({
        type: 'branchAction',
        payload: { name: 'origin/feature', isRemote: true, action: 'delete' },
      });

      await vi.waitFor(() => {
        expect(remote.git('branch').includes('feature')).toBe(false);
      });
    } finally {
      tempRepo.cleanup();
      remote.cleanup();
    }
  });

  it('prunes stale remote-tracking refs for a remote via pruneRemote', async () => {
    const tempRepo = createTempRepo();
    const remote = createBareRepo();
    try {
      commit(tempRepo, 'a.txt', 'v1\n', 'initial');
      tempRepo.git('remote', 'add', 'origin', remote.root);
      tempRepo.git('branch', 'feature');
      tempRepo.git('push', '-q', 'origin', 'main', 'feature');
      tempRepo.git('fetch', '-q', 'origin');
      remote.git('branch', '-D', 'feature');

      const { view } = setup(tempRepo);
      view.webview.postedMessages.length = 0;

      view.webview.simulateMessage({ type: 'pruneRemote', payload: { remote: 'origin' } });

      await vi.waitFor(() => {
        const reply: any = view.webview.postedMessages.find((m: any) => m.type === 'branches');
        expect(reply?.payload.branches.some((b: any) => b.name === 'origin/feature')).toBe(false);
      });
    } finally {
      tempRepo.cleanup();
      remote.cleanup();
    }
  });

  it('pushes the repo list and switches the active repo via switchRepository', async () => {
    const tempRepoA = createTempRepo();
    const tempRepoB = createTempRepo();
    try {
      commit(tempRepoA, 'a.txt', 'v1\n', 'from repo A');
      commit(tempRepoB, 'b.txt', 'v1\n', 'from repo B');
      const { view, repoManager } = setup(tempRepoA);
      repoManager.repository2.rootUri = vscode.Uri.file(tempRepoB.root);
      repoManager.gitApi.repositories.push(repoManager.repository2);
      view.webview.postedMessages.length = 0;

      view.webview.simulateMessage({ type: 'ready' });
      await vi.waitFor(() => {
        const reply: any = view.webview.postedMessages.find((m: any) => m.type === 'repos');
        expect(reply?.payload.repos.map((r: any) => r.rootPath)).toEqual(
          expect.arrayContaining([tempRepoA.root, tempRepoB.root]),
        );
        expect(reply?.payload.activeRepoRoot).toBe(tempRepoA.root);
      });

      view.webview.simulateMessage({ type: 'switchRepository', payload: { rootPath: tempRepoB.root } });

      await vi.waitFor(() => {
        const reply: any = view.webview.postedMessages.find(
          (m: any) => m.type === 'repos' && m.payload.activeRepoRoot === tempRepoB.root,
        );
        expect(reply).toBeDefined();
      });
    } finally {
      tempRepoA.cleanup();
      tempRepoB.cleanup();
    }
  });
});
