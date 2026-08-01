import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { FakeRepoManager } from '../mocks/repoManager';
import { createBareRepo, createTempRepo, type TempRepo } from '../helpers/tempRepo';
import { BranchesPanel } from '../../src/webviews/branches/BranchesPanel';

// Exercises BranchesPanel's own action-dispatch logic (handleBranchAction),
// not just the cli.ts functions it calls — real repos + real dialog-mock
// gating, since the interesting bugs here would be in the *branching logic*
// (does delete correctly skip confirmation for merged branches? does rename
// correctly no-op for remote branches? etc.), not the git commands themselves.

let tempRepo: TempRepo;
let repoManager: FakeRepoManager;
let panel: any;

function commit(repo: TempRepo, file: string, content: string, message: string): string {
  repo.write(file, content);
  repo.git('add', file);
  repo.git('commit', '-q', '-m', message);
  return repo.git('rev-parse', 'HEAD').trim();
}

async function sendAction(name: string, isRemote: boolean, action: string): Promise<void> {
  panel.webview.simulateMessage({ type: 'branchAction', payload: { name, isRemote, action } });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

beforeEach(() => {
  vi.mocked(vscode.window.showWarningMessage).mockReset();
  vi.mocked(vscode.window.showInformationMessage).mockReset();
  vi.mocked(vscode.window.showInputBox).mockReset();
  vi.mocked(vscode.window.createWebviewPanel).mockClear();

  tempRepo = createTempRepo();
  commit(tempRepo, 'a.txt', 'v1\n', 'initial');
  repoManager = new FakeRepoManager();
  repoManager.repository.rootUri = vscode.Uri.file(tempRepo.root);

  BranchesPanel.createOrShow(vscode.Uri.file('/ext'), repoManager as never);
  panel = vi.mocked(vscode.window.createWebviewPanel).mock.results[0].value;
});

afterEach(() => {
  panel.simulateDispose();
  tempRepo.cleanup();
});

describe('checkout', () => {
  it('switches HEAD for a local branch', async () => {
    tempRepo.git('branch', 'other');
    await sendAction('other', false, 'checkout');
    await vi.waitFor(() => {
      expect(tempRepo.git('branch', '--show-current').trim()).toBe('other');
    });
  });

  it('creates a local tracking branch for a remote branch', async () => {
    const bare = createBareRepo();
    tempRepo.git('remote', 'add', 'origin', bare.root);
    tempRepo.git('push', '-q', 'origin', 'main');
    tempRepo.git('checkout', '-q', '-b', 'feature');
    commit(tempRepo, 'b.txt', 'v1\n', 'feature work');
    tempRepo.git('push', '-q', 'origin', 'feature');
    tempRepo.git('checkout', '-q', 'main');
    tempRepo.git('branch', '-D', 'feature');
    tempRepo.git('fetch', '-q', 'origin');

    await sendAction('origin/feature', true, 'checkout');
    await vi.waitFor(() => {
      expect(tempRepo.git('branch', '--show-current').trim()).toBe('feature');
    });
    bare.cleanup();
  });
});

describe('newBranchFrom', () => {
  it('creates a branch when a name is entered', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('new-feature');
    await sendAction('main', false, 'newBranchFrom');
    await vi.waitFor(() => {
      expect(tempRepo.git('branch').includes('new-feature')).toBe(true);
    });
  });

  it('does nothing when the input box is cancelled', async () => {
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce(undefined);
    await sendAction('main', false, 'newBranchFrom');
    await settle();
    expect(tempRepo.git('branch').includes('new-feature')).toBe(false);
  });
});

describe('delete', () => {
  // "feature", not "main" — bare repos refuse to delete whatever branch their
  // (symbolic) HEAD points at, same as a non-bare repo's checked-out branch.
  it('does not delete a remote branch without confirmation', async () => {
    const remote = createBareRepo();
    tempRepo.git('remote', 'add', 'origin', remote.root);
    tempRepo.git('branch', 'feature');
    tempRepo.git('push', '-q', 'origin', 'main', 'feature');
    tempRepo.git('fetch', '-q', 'origin');
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce(undefined);

    try {
      await sendAction('origin/feature', true, 'delete');
      await vi.waitFor(() => {
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      });
      expect(remote.git('branch').includes('feature')).toBe(true);
    } finally {
      remote.cleanup();
    }
  });

  it('deletes a remote branch on the actual remote when confirmed', async () => {
    const remote = createBareRepo();
    tempRepo.git('remote', 'add', 'origin', remote.root);
    tempRepo.git('branch', 'feature');
    tempRepo.git('push', '-q', 'origin', 'main', 'feature');
    tempRepo.git('fetch', '-q', 'origin');
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Delete on Remote' as never);

    try {
      await sendAction('origin/feature', true, 'delete');
      await vi.waitFor(() => {
        expect(remote.git('branch').includes('feature')).toBe(false);
      });
    } finally {
      remote.cleanup();
    }
  });

  it('deletes a merged local branch without asking for confirmation', async () => {
    tempRepo.git('branch', 'merged-branch');
    await sendAction('merged-branch', false, 'delete');
    await vi.waitFor(() => {
      expect(tempRepo.git('branch').includes('merged-branch')).toBe(false);
    });
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('keeps an unmerged local branch if the confirmation is cancelled', async () => {
    tempRepo.git('checkout', '-q', '-b', 'unmerged');
    commit(tempRepo, 'b.txt', 'v1\n', 'unique work');
    tempRepo.git('checkout', '-q', 'main');
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce(undefined);

    await sendAction('unmerged', false, 'delete');
    await settle();
    expect(tempRepo.git('branch').includes('unmerged')).toBe(true);
  });

  it('force-deletes an unmerged local branch when confirmed', async () => {
    tempRepo.git('checkout', '-q', '-b', 'unmerged');
    commit(tempRepo, 'b.txt', 'v1\n', 'unique work');
    tempRepo.git('checkout', '-q', 'main');
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Delete' as never);

    await sendAction('unmerged', false, 'delete');
    await vi.waitFor(() => {
      expect(tempRepo.git('branch').includes('unmerged')).toBe(false);
    });
  });
});

describe('rename', () => {
  it('is a no-op for remote branches', async () => {
    await sendAction('origin/main', true, 'rename');
    await settle();
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
  });

  it('renames a local branch when a new name is entered', async () => {
    tempRepo.git('branch', 'old-name');
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('new-name');
    await sendAction('old-name', false, 'rename');
    await vi.waitFor(() => {
      expect(tempRepo.git('branch').includes('new-name')).toBe(true);
      expect(tempRepo.git('branch').includes('old-name')).toBe(false);
    });
  });

  it('does nothing when the input box is cancelled', async () => {
    tempRepo.git('branch', 'old-name');
    vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce(undefined);
    await sendAction('old-name', false, 'rename');
    await settle();
    expect(tempRepo.git('branch').includes('old-name')).toBe(true);
  });
});

describe('merge', () => {
  it('merges the target branch into current when confirmed', async () => {
    tempRepo.git('checkout', '-q', '-b', 'feature');
    commit(tempRepo, 'b.txt', 'v1\n', 'feature work');
    tempRepo.git('checkout', '-q', 'main');
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce('Merge' as never);

    await sendAction('feature', false, 'merge');
    await vi.waitFor(() => {
      expect(tempRepo.git('log', '-1', '--format=%s').trim()).toBe('feature work');
    });
  });

  it('does nothing when cancelled', async () => {
    tempRepo.git('checkout', '-q', '-b', 'feature');
    commit(tempRepo, 'b.txt', 'v1\n', 'feature work');
    tempRepo.git('checkout', '-q', 'main');
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(undefined);

    await sendAction('feature', false, 'merge');
    await settle();
    expect(tempRepo.git('log', '-1', '--format=%s').trim()).toBe('initial');
  });
});

describe('rebase', () => {
  it('rebases current branch onto the target when confirmed', async () => {
    commit(tempRepo, 'shared.txt', 'v1\n', 'shared');
    tempRepo.git('checkout', '-q', '-b', 'feature');
    commit(tempRepo, 'b.txt', 'v1\n', 'feature work');
    tempRepo.git('checkout', '-q', 'main');
    commit(tempRepo, 'c.txt', 'v1\n', 'main work');
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Rebase' as never);

    await sendAction('feature', false, 'rebase');
    await vi.waitFor(() => {
      const subjects = tempRepo.git('log', '--format=%s').trim().split('\n');
      expect(subjects).toEqual(['main work', 'feature work', 'shared', 'initial']);
    });
  });
});

describe('compare', () => {
  it('opens a native diff', async () => {
    tempRepo.git('checkout', '-q', '-b', 'feature');
    commit(tempRepo, 'a.txt', 'v2\n', 'feature work');
    tempRepo.git('checkout', '-q', 'main');

    await sendAction('feature', false, 'compare');
    await vi.waitFor(() => {
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.anything(),
        expect.anything(),
        expect.any(String),
      );
    });
  });

  it('opens the file directly when it only exists on one side', async () => {
    tempRepo.git('checkout', '-q', '-b', 'feature');
    commit(tempRepo, 'b.txt', 'v1\n', 'feature work');
    tempRepo.git('checkout', '-q', 'main');
    vi.mocked(vscode.commands.executeCommand).mockClear();

    await sendAction('feature', false, 'compare');
    await vi.waitFor(() => {
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.anything(),
      );
    });
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'vscode.diff',
      expect.anything(),
      expect.anything(),
      expect.any(String),
    );
  });
});

describe('switchRepository', () => {
  it('pushes the repo list on ready and switches which repo state reflects', async () => {
    const tempRepoB = createTempRepo();
    try {
      commit(tempRepoB, 'b.txt', 'v1\n', 'from repo B');
      repoManager.repository2.rootUri = vscode.Uri.file(tempRepoB.root);
      repoManager.gitApi.repositories.push(repoManager.repository2);
      panel.webview.postedMessages.length = 0;

      panel.webview.simulateMessage({ type: 'ready' });
      await vi.waitFor(() => {
        const reply: any = panel.webview.postedMessages.find((m: any) => m.type === 'repos');
        expect(reply?.payload.repos.map((r: any) => r.rootPath)).toEqual(
          expect.arrayContaining([tempRepo.root, tempRepoB.root]),
        );
        expect(reply?.payload.activeRepoRoot).toBe(tempRepo.root);
      });

      panel.webview.simulateMessage({ type: 'switchRepository', payload: { rootPath: tempRepoB.root } });

      await vi.waitFor(() => {
        const reply: any = panel.webview.postedMessages.find(
          (m: any) => m.type === 'state' && m.payload.branches.some((b: any) => b.lastCommitSubject === 'from repo B'),
        );
        expect(reply).toBeDefined();
      });
    } finally {
      tempRepoB.cleanup();
    }
  });
});
