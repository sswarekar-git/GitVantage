import * as vscode from 'vscode';
import type { LocalHistoryStore } from './store';
import { localHistoryUri } from './contentProvider';
import { formatRelativeTime } from '../util/relativeTime';

interface HistoryItem extends vscode.QuickPickItem {
  id: string;
}

export function registerLocalHistoryCommand(context: vscode.ExtensionContext, store: LocalHistoryStore): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitpeak.localHistory.show', () => showHistory(store)),
  );
}

async function showHistory(store: LocalHistoryStore): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('GitPeak: open a file to view its local history.');
    return;
  }
  const uri = editor.document.uri;
  const snapshots = await store.listSnapshots(uri);
  if (snapshots.length === 0) {
    vscode.window.showInformationMessage('GitPeak: no local history recorded for this file yet.');
    return;
  }

  const items: HistoryItem[] = snapshots.map((s) => ({
    id: s.id,
    label: formatRelativeTime(s.timestamp / 1000),
    description: new Date(s.timestamp).toLocaleString(),
    detail: `${s.size.toLocaleString()} bytes`,
    buttons: [{ iconPath: new vscode.ThemeIcon('discard'), tooltip: 'Revert to this version' }],
  }));

  const quickPick = vscode.window.createQuickPick<HistoryItem>();
  quickPick.items = items;
  quickPick.title = `Local History — ${vscode.workspace.asRelativePath(uri)}`;
  quickPick.placeholder = 'Select a version to view its diff, or click the revert icon';

  quickPick.onDidTriggerItemButton(async (e) => {
    quickPick.hide();
    await revertToSnapshot(uri, e.item.id, e.item.label, store);
  });

  quickPick.onDidChangeSelection(async ([item]) => {
    if (!item) return;
    quickPick.hide();
    const historyUri = localHistoryUri(uri, item.id);
    await vscode.commands.executeCommand(
      'vscode.diff',
      historyUri,
      uri,
      `${vscode.workspace.asRelativePath(uri)} (${item.label} ↔ Current)`,
    );
  });

  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

async function revertToSnapshot(
  uri: vscode.Uri,
  id: string,
  label: string,
  store: LocalHistoryStore,
): Promise<void> {
  const content = await store.readSnapshot(uri, id);
  const confirm = await vscode.window.showWarningMessage(
    `Revert ${vscode.workspace.asRelativePath(uri)} to the version from ${label}? This replaces the current editor content (undoable with Ctrl+Z).`,
    { modal: true },
    'Revert',
  );
  if (confirm !== 'Revert') return;

  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
  await editor.edit((editBuilder) => editBuilder.replace(fullRange, content));
}
