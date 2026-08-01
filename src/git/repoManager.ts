import * as path from 'path';
import * as vscode from 'vscode';
import type { GitAPI, Repository } from './vscodeGitTypes';
import { getBuiltinGitApi, onDidChangeRepoState } from './builtinApi';
import { log } from '../util/logger';
import { setGitPath } from '../util/exec';

type Listener = () => void;

export interface RepoSummary {
  name: string;
  rootPath: string;
}

// Longest-rootUri.fsPath-prefix match, so a repo nested inside another repo's
// folder resolves to the more specific (inner) one rather than the outer.
export function findRepositoryForFile(repositories: Repository[], uri: vscode.Uri): Repository | undefined {
  let best: Repository | undefined;
  for (const repo of repositories) {
    const root = repo.rootUri.fsPath;
    if (uri.fsPath === root || uri.fsPath.startsWith(root + path.sep)) {
      if (!best || root.length > best.rootUri.fsPath.length) best = repo;
    }
  }
  return best;
}

export function toRepoSummary(repo: Repository): RepoSummary {
  return { name: path.basename(repo.rootUri.fsPath), rootPath: repo.rootUri.fsPath };
}

export class RepoManager implements vscode.Disposable {
  private api: GitAPI | undefined;
  private listeners = new Set<Listener>();
  private disposables: vscode.Disposable[] = [];
  private debounceTimer: NodeJS.Timeout | undefined;
  // Identity by fsPath (not object reference) — Repository objects can be
  // recreated by the built-in git extension across repository list refreshes.
  private selectedRepoRoot: string | undefined;

  async activate(): Promise<void> {
    this.api = await getBuiltinGitApi();
    if (this.api.git?.path) {
      setGitPath(this.api.git.path);
    }

    for (const repo of this.api.repositories) {
      this.watchRepo(repo);
    }
    this.disposables.push(this.api.onDidOpenRepository((repo) => this.watchRepo(repo)));

    const fsWatcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,refs/**,logs/refs/stash}');
    this.disposables.push(
      fsWatcher,
      fsWatcher.onDidChange(() => this.scheduleBroadcast()),
      fsWatcher.onDidCreate(() => this.scheduleBroadcast()),
      fsWatcher.onDidDelete(() => this.scheduleBroadcast()),
    );

    this.disposables.push(vscode.window.onDidChangeActiveTextEditor((editor) => this.onActiveEditorChanged(editor)));
    this.onActiveEditorChanged(vscode.window.activeTextEditor);

    log(`GitVantage: tracking ${this.api.repositories.length} repositor${this.api.repositories.length === 1 ? 'y' : 'ies'}`);
  }

  private watchRepo(repo: Repository): void {
    this.disposables.push(onDidChangeRepoState(repo, () => this.scheduleBroadcast()));
    this.scheduleBroadcast();
  }

  // Auto-follow: switching the active editor to a file in a different repo's
  // folder re-syncs which repo GitVantage's panels operate on. A file that
  // doesn't resolve to any known repo (untracked, output/settings editors,
  // etc.) leaves the current selection untouched.
  private onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.uri.scheme !== 'file') return;
    const repo = this.getRepositoryForFile(editor.document.uri);
    if (repo && repo.rootUri.fsPath !== this.selectedRepoRoot) {
      this.selectedRepoRoot = repo.rootUri.fsPath;
      this.broadcastNow();
    }
  }

  getActiveRepository(): Repository | undefined {
    const repos = this.api?.repositories ?? [];
    if (this.selectedRepoRoot) {
      const match = repos.find((r) => r.rootUri.fsPath === this.selectedRepoRoot);
      if (match) return match;
      this.selectedRepoRoot = undefined;
    }
    return repos[0];
  }

  getRepositoryForFile(uri: vscode.Uri): Repository | undefined {
    return findRepositoryForFile(this.api?.repositories ?? [], uri);
  }

  getRepositorySummaries(): RepoSummary[] {
    return (this.api?.repositories ?? []).map(toRepoSummary);
  }

  // A deliberate user action (status bar / in-panel picker), not a
  // filesystem event — broadcasts immediately rather than debounced, so
  // panels refresh right away instead of waiting up to 150ms.
  setActiveRepository(rootPath: string): void {
    const repos = this.api?.repositories ?? [];
    if (!repos.some((r) => r.rootUri.fsPath === rootPath)) return;
    this.selectedRepoRoot = rootPath;
    this.broadcastNow();
  }

  getGitApi(): GitAPI | undefined {
    return this.api;
  }

  onDidChange(listener: Listener): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => this.listeners.delete(listener));
  }

  private broadcastNow(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    for (const listener of this.listeners) listener();
  }

  private scheduleBroadcast(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.broadcastNow(), 150);
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.listeners.clear();
  }
}
