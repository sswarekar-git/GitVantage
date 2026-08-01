import * as vscode from 'vscode';
import type { GitAPI } from '../git/vscodeGitTypes';
import * as cli from '../git/cli';

function shortRef(ref: string): string {
  return /^[0-9a-f]{7,40}$/i.test(ref) ? ref.slice(0, 8) : ref;
}

// Diffs `from` against `to` (or the working tree when `to` is omitted) and opens
// each changed file in VSCode's native diff editor — reused by the Log graph's
// "Compare with…" actions and the Branches popup's "Compare with Current" action.
export async function openCompareDiffs(
  api: GitAPI,
  repoRoot: string,
  from: string,
  to: string | undefined,
): Promise<void> {
  const files = await cli.diffNameStatus(repoRoot, from, to);
  if (files.length === 0) {
    vscode.window.showInformationMessage('GitPeak: no differences');
    return;
  }
  for (const file of files.slice(0, 25)) {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(repoRoot), file.path);

    // Added file has no content at `from`; deleted file has none at `to`.
    // Diffing against the missing side throws "Unable to resolve nonexistent
    // file" from vscode.git's content provider, so open the existing side alone.
    if (file.status.startsWith('A')) {
      await vscode.commands.executeCommand('vscode.open', to ? api.toGitUri(uri, to) : uri);
      continue;
    }
    if (file.status.startsWith('D')) {
      await vscode.commands.executeCommand('vscode.open', api.toGitUri(uri, from));
      continue;
    }

    const leftUri = api.toGitUri(uri, from);
    const rightUri = to ? api.toGitUri(uri, to) : uri;
    const title = `${file.path} (${shortRef(from)} ↔ ${to ? shortRef(to) : 'Working Tree'})`;
    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
  }
}
