// Minimal fake of the `vscode` module, scoped to exactly what GitPeak's host
// code touches (see the grep audit in the test-suite PR) — not a general
// VSCode API shim. Aliased in vitest.config.ts so `import * as vscode from
// 'vscode'` resolves to this everywhere under test.
import { vi } from 'vitest';
import * as fsp from 'fs/promises';
import * as path from 'path';

export class Uri {
  private constructor(
    public readonly scheme: string,
    public readonly fsPath: string,
    public readonly path: string,
    public readonly query: string,
  ) {}

  static file(fsPath: string): Uri {
    return new Uri('file', fsPath, fsPath, '');
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = path.join(base.fsPath, ...segments);
    return new Uri(base.scheme, joined, joined, base.query);
  }

  static from(components: { scheme: string; path?: string; query?: string }): Uri {
    const p = components.path ?? '';
    return new Uri(components.scheme, p, p, components.query ?? '');
  }

  with(change: Partial<{ scheme: string; path: string; query: string }>): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.path ?? this.fsPath,
      change.path ?? this.path,
      change.query ?? this.query,
    );
  }

  toString(): string {
    return `${this.scheme}:${this.path}${this.query ? `?${this.query}` : ''}`;
  }
}

export const ViewColumn = { Active: -1, Beside: -2, One: 1 };
export const StatusBarAlignment = { Left: 1, Right: 2 };

export class Disposable {
  constructor(private readonly callback: () => void) {}
  dispose(): void {
    this.callback();
  }
  static from(...items: { dispose(): void }[]): Disposable {
    return new Disposable(() => items.forEach((i) => i.dispose()));
  }
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}
export class ThemeColor {
  constructor(public readonly id: string) {}
}
export class MarkdownString {
  constructor(public readonly value: string = '') {}
}

export interface FakeWebview {
  html: string;
  cspSource: string;
  options: Record<string, unknown>;
  postedMessages: unknown[];
  postMessage: ReturnType<typeof vi.fn>;
  onDidReceiveMessage: ReturnType<typeof vi.fn>;
  asWebviewUri: (uri: Uri) => Uri;
  simulateMessage: (msg: unknown) => void;
}

function makeFakeWebview(): FakeWebview {
  const handlers: Array<(msg: unknown) => void> = [];
  const webview: FakeWebview = {
    html: '',
    cspSource: 'mock-csp',
    options: {},
    postedMessages: [],
    postMessage: vi.fn((msg: unknown) => {
      webview.postedMessages.push(msg);
      return Promise.resolve(true);
    }),
    onDidReceiveMessage: vi.fn((handler: (msg: unknown) => void) => {
      handlers.push(handler);
      return new Disposable(() => {});
    }),
    asWebviewUri: (uri: Uri) => uri,
    simulateMessage: (msg: unknown) => handlers.forEach((h) => h(msg)),
  };
  return webview;
}

export interface FakeWebviewPanel {
  webview: FakeWebview;
  visible: boolean;
  onDidDispose: ReturnType<typeof vi.fn>;
  onDidChangeViewState: ReturnType<typeof vi.fn>;
  reveal: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  simulateDispose: () => void;
}

function makeFakeWebviewPanel(): FakeWebviewPanel {
  const disposeHandlers: Array<() => void> = [];
  const panel: FakeWebviewPanel = {
    webview: makeFakeWebview(),
    visible: true,
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandlers.push(handler);
      return new Disposable(() => {});
    }),
    onDidChangeViewState: vi.fn(() => new Disposable(() => {})),
    reveal: vi.fn(),
    dispose: vi.fn(),
    simulateDispose: () => disposeHandlers.forEach((h) => h()),
  };
  return panel;
}

export interface FakeWebviewView {
  webview: FakeWebview;
  visible: boolean;
  onDidChangeVisibility: ReturnType<typeof vi.fn>;
}

function makeFakeWebviewView(): FakeWebviewView {
  return {
    webview: makeFakeWebview(),
    visible: true,
    onDidChangeVisibility: vi.fn(() => new Disposable(() => {})),
  };
}

export const _test = { makeFakeWebviewPanel, makeFakeWebviewView };

export const window = {
  createWebviewPanel: vi.fn(() => makeFakeWebviewPanel()),
  registerWebviewViewProvider: vi.fn(() => new Disposable(() => {})),
  createStatusBarItem: vi.fn(() => ({
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  })),
  showWarningMessage: vi.fn(async () => undefined as string | undefined),
  showInformationMessage: vi.fn(async () => undefined as string | undefined),
  showErrorMessage: vi.fn(async () => undefined as string | undefined),
  showInputBox: vi.fn(async () => undefined as string | undefined),
  showTextDocument: vi.fn(async () => undefined),
  createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
  createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
  activeTextEditor: undefined as unknown,
  visibleTextEditors: [] as unknown[],
  onDidChangeActiveTextEditor: vi.fn(() => new Disposable(() => {})),
};

export const workspace = {
  getConfiguration: vi.fn((_section?: string) => ({
    get: (_key: string, def?: unknown) => def,
  })),
  fs: {
    async readFile(uri: Uri): Promise<Uint8Array> {
      const buf = await fsp.readFile(uri.fsPath);
      return new Uint8Array(buf);
    },
    async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
      await fsp.mkdir(path.dirname(uri.fsPath), { recursive: true });
      await fsp.writeFile(uri.fsPath, content);
    },
    async createDirectory(uri: Uri): Promise<void> {
      await fsp.mkdir(uri.fsPath, { recursive: true });
    },
    async delete(uri: Uri): Promise<void> {
      await fsp.rm(uri.fsPath, { force: true, recursive: true });
    },
  },
  onDidSaveTextDocument: vi.fn(() => new Disposable(() => {})),
  createFileSystemWatcher: vi.fn(() => ({
    onDidChange: vi.fn(() => new Disposable(() => {})),
    onDidCreate: vi.fn(() => new Disposable(() => {})),
    onDidDelete: vi.fn(() => new Disposable(() => {})),
    dispose: vi.fn(),
  })),
  registerTextDocumentContentProvider: vi.fn(() => new Disposable(() => {})),
  asRelativePath: (uri: Uri) => uri.fsPath,
  openTextDocument: vi.fn(async (uri: Uri) => ({ uri, lineCount: 0 })),
};

export const commands = {
  registerCommand: vi.fn(() => new Disposable(() => {})),
  executeCommand: vi.fn(async () => undefined),
};

export const extensions = {
  getExtension: vi.fn(() => undefined),
};
