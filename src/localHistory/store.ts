import * as vscode from 'vscode';
import * as crypto from 'crypto';

export interface SnapshotMeta {
  id: string;
  timestamp: number; // unix ms
  size: number;
}

interface IndexFile {
  snapshots: SnapshotMeta[];
}

const MAX_SNAPSHOTS_PER_FILE = 50;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

// A minimal local-history snapshot store, independent of git.
// Snapshots are recorded on save (see extension.ts), capped per file, and
// skipped entirely when content is unchanged from the last snapshot so
// repeated saves without edits don't bloat storage. Uses vscode.workspace.fs
// rather than Node's fs so it works over remote/virtual filesystems too.
export class LocalHistoryStore {
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(private readonly storageRoot: vscode.Uri) {}

  private keyFor(uri: vscode.Uri): string {
    return crypto.createHash('sha1').update(uri.fsPath).digest('hex');
  }

  private dirFor(uri: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(this.storageRoot, this.keyFor(uri));
  }

  private indexUri(uri: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(this.dirFor(uri), 'index.json');
  }

  private async readIndex(uri: vscode.Uri): Promise<IndexFile> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.indexUri(uri));
      return JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
      return { snapshots: [] };
    }
  }

  private async writeIndex(uri: vscode.Uri, index: IndexFile): Promise<void> {
    await vscode.workspace.fs.writeFile(this.indexUri(uri), Buffer.from(JSON.stringify(index), 'utf8'));
  }

  // Serialized per file: two near-simultaneous saves (e.g. an autosave racing
  // a manual Ctrl+S) would otherwise both read the same index.json, append
  // independently, and have the second write clobber the first's entry.
  async recordSnapshot(uri: vscode.Uri, content: string): Promise<void> {
    const key = this.keyFor(uri);
    const prior = this.writeQueues.get(key) ?? Promise.resolve();
    const next = prior.then(() => this.doRecordSnapshot(uri, content));
    this.writeQueues.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  private async doRecordSnapshot(uri: vscode.Uri, content: string): Promise<void> {
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE_BYTES) return;

    const dir = this.dirFor(uri);
    await vscode.workspace.fs.createDirectory(dir);
    const index = await this.readIndex(uri);

    const last = index.snapshots[index.snapshots.length - 1];
    if (last) {
      const lastContent = await this.readSnapshotContent(dir, last.id).catch(() => undefined);
      if (lastContent === content) return;
    }

    const id = `${Date.now()}`;
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, `${id}.snapshot`), Buffer.from(content, 'utf8'));
    index.snapshots.push({ id, timestamp: Date.now(), size: Buffer.byteLength(content, 'utf8') });

    while (index.snapshots.length > MAX_SNAPSHOTS_PER_FILE) {
      const removed = index.snapshots.shift()!;
      try {
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(dir, `${removed.id}.snapshot`));
      } catch {
        // best-effort cleanup — a stray file left behind isn't worth failing the save over
      }
    }

    await this.writeIndex(uri, index);
  }

  async listSnapshots(uri: vscode.Uri): Promise<SnapshotMeta[]> {
    const index = await this.readIndex(uri);
    return [...index.snapshots].reverse();
  }

  async readSnapshot(uri: vscode.Uri, id: string): Promise<string> {
    return this.readSnapshotContent(this.dirFor(uri), id);
  }

  private async readSnapshotContent(dir: vscode.Uri, id: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, `${id}.snapshot`));
    return Buffer.from(bytes).toString('utf8');
  }
}
