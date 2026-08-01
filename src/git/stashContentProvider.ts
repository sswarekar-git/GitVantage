import * as vscode from 'vscode';
import { execGit } from '../util/exec';

export const STASH_SCHEME = 'gitvantage-stash';

export function stashFileUri(repoRoot: string, ref: string, relativePath: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: STASH_SCHEME,
    path: `/${relativePath}`,
    query: JSON.stringify({ repoRoot, ref }),
  });
}

export class StashContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { repoRoot, ref } = JSON.parse(uri.query) as { repoRoot: string; ref: string };
    const relativePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
    try {
      const { stdout } = await execGit(repoRoot, ['show', `${ref}:${relativePath}`]);
      return stdout;
    } catch {
      return '';
    }
  }
}
