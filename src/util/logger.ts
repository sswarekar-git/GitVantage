import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function initLogger(): vscode.OutputChannel {
  channel = vscode.window.createOutputChannel('GitVantage');
  return channel;
}

export function log(message: string): void {
  channel?.appendLine(message);
}

export function logError(message: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  channel?.appendLine(`[error] ${message}: ${detail}`);
}
