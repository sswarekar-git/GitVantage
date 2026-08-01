import * as vscode from 'vscode';
import * as path from 'path';
import type { RepoManager } from '../git/repoManager';
import { getBlame } from '../git/cli';
import type { BlameLine } from '../git/types';
import { formatRelativeTime } from '../util/relativeTime';
import { logError } from '../util/logger';

const MAX_SUMMARY_LEN = 60;

export class BlameController implements vscode.Disposable {
  private enabled = false;
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly blameCache = new Map<string, BlameLine[]>(); // key: file uri string

  constructor(private readonly repoManager: RepoManager) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      after: {
        margin: '0 0 0 3em',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
      },
    });

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.enabled && editor) this.decorate(editor);
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this.blameCache.delete(doc.uri.toString());
        if (this.enabled) {
          const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
          if (editor) this.decorate(editor);
        }
      }),
    );
  }

  async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    if (this.enabled) {
      const editor = vscode.window.activeTextEditor;
      if (editor) await this.decorate(editor);
    } else {
      for (const editor of vscode.window.visibleTextEditors) {
        editor.setDecorations(this.decorationType, []);
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async decorate(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    if (doc.uri.scheme !== 'file') return;
    // Blame the file's own repo, independent of whichever repo GitVantage's
    // panels currently show — otherwise blaming a file in repo B while the
    // panels are scoped to repo A computes a bogus relative path.
    const repo = this.repoManager.getRepositoryForFile(doc.uri) ?? this.repoManager.getActiveRepository();
    if (!repo) return;

    try {
      const cacheKey = doc.uri.toString();
      let blame = this.blameCache.get(cacheKey);
      if (!blame) {
        const relativePath = path.relative(repo.rootUri.fsPath, doc.uri.fsPath);
        blame = await getBlame(repo.rootUri.fsPath, relativePath);
        this.blameCache.set(cacheKey, blame);
      }

      const decorations: vscode.DecorationOptions[] = [];
      for (let i = 0; i < doc.lineCount && i < blame.length; i++) {
        const b = blame[i];
        const summary = b.summary.length > MAX_SUMMARY_LEN ? `${b.summary.slice(0, MAX_SUMMARY_LEN)}…` : b.summary;
        const label =
          b.authorTime === 0 ? b.author : `${b.author}, ${formatRelativeTime(b.authorTime)} • ${summary}`;
        decorations.push({
          range: doc.lineAt(i).range,
          renderOptions: { after: { contentText: label } },
          hoverMessage: new vscode.MarkdownString(
            b.authorTime === 0
              ? '_Not committed yet_'
              : `**${b.author}**\n\n${b.summary}\n\n${new Date(b.authorTime * 1000).toLocaleString()}\n\n\`${b.sha.slice(0, 8)}\``,
          ),
        });
      }
      editor.setDecorations(this.decorationType, decorations);
    } catch (err) {
      logError('computing blame', err);
    }
  }

  dispose(): void {
    this.decorationType.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
