import * as vscode from 'vscode';
import type { LocalHistoryStore } from './store';

export const LOCAL_HISTORY_SCHEME = 'gitvantage-localhistory';

export function localHistoryUri(fileUri: vscode.Uri, snapshotId: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: LOCAL_HISTORY_SCHEME,
    path: fileUri.path,
    query: JSON.stringify({ fsPath: fileUri.fsPath, id: snapshotId }),
  });
}

export class LocalHistoryContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly store: LocalHistoryStore) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { fsPath, id } = JSON.parse(uri.query) as { fsPath: string; id: string };
    return this.store.readSnapshot(vscode.Uri.file(fsPath), id);
  }
}
