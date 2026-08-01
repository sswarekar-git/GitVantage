import { vi } from 'vitest';
import * as vscode from 'vscode';

// A structural stand-in for RepoManager — panels only ever see it through the
// type, never construct the real class (which requires the actual vscode.git
// extension), so a plain object satisfying the same shape is all a wiring
// test needs.
export function makeFakeRepository(rootPath = '/fake/repo') {
  return {
    rootUri: vscode.Uri.file(rootPath),
    state: {
      HEAD: { name: 'main', commit: 'deadbeef' },
      indexChanges: [] as unknown[],
      workingTreeChanges: [] as unknown[],
      mergeChanges: [] as unknown[],
      onDidChange: vi.fn(() => new vscode.Disposable(() => {})),
    },
    add: vi.fn(),
    revert: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
  };
}

export class FakeRepoManager {
  readonly repository = makeFakeRepository('/fake/repo');
  // Not in `gitApi.repositories` by default — existing single-repo tests stay
  // unaffected; multi-repo tests push it in themselves.
  readonly repository2 = makeFakeRepository('/fake/repo2');
  readonly gitApi = {
    repositories: [this.repository],
    onDidOpenRepository: vi.fn(() => new vscode.Disposable(() => {})),
    onDidCloseRepository: vi.fn(() => new vscode.Disposable(() => {})),
    git: { path: 'git' },
    toGitUri: (uri: vscode.Uri) => uri,
  };

  private listeners: Array<() => void> = [];
  private selectedRepoRoot: string | undefined;

  getActiveRepository() {
    if (this.selectedRepoRoot) {
      const match = this.gitApi.repositories.find((r) => r.rootUri.fsPath === this.selectedRepoRoot);
      if (match) return match;
    }
    return this.gitApi.repositories[0];
  }

  getRepositoryForFile(uri: vscode.Uri) {
    return this.gitApi.repositories.find(
      (r) => uri.fsPath === r.rootUri.fsPath || uri.fsPath.startsWith(`${r.rootUri.fsPath}/`),
    );
  }

  getRepositorySummaries() {
    return this.gitApi.repositories.map((r) => ({
      name: r.rootUri.fsPath.split('/').pop() ?? r.rootUri.fsPath,
      rootPath: r.rootUri.fsPath,
    }));
  }

  setActiveRepository(rootPath: string): void {
    if (!this.gitApi.repositories.some((r) => r.rootUri.fsPath === rootPath)) return;
    this.selectedRepoRoot = rootPath;
    this.fireChange();
  }

  getGitApi() {
    return this.gitApi;
  }

  onDidChange(listener: () => void): vscode.Disposable {
    this.listeners.push(listener);
    return new vscode.Disposable(() => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    });
  }

  get listenerCount(): number {
    return this.listeners.length;
  }

  fireChange(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
