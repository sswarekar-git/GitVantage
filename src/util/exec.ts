import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { logError } from './logger';

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export class GitCommandError extends Error {
  constructor(message: string, public readonly stderr: string) {
    super(message);
  }
}

// Defaults to a bare 'git' lookup via PATH, but the extension-development host
// process doesn't always inherit the same PATH as the user's normal VSCode window
// (a known Extension Development Host quirk). repoManager overrides this with the
// exact binary path the built-in vscode.git extension already resolved for itself,
// sidestepping our own PATH lookup entirely.
let gitPath = 'git';

export function setGitPath(path: string): void {
  gitPath = path;
}

export function execGit(
  cwd: string,
  args: string[],
  opts?: { token?: vscode.CancellationToken; maxBuffer?: number },
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      gitPath,
      args,
      { cwd, maxBuffer: opts?.maxBuffer ?? 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          if (opts?.token?.isCancellationRequested) {
            reject(new Error('cancelled'));
            return;
          }
          logError(`git ${args.join(' ')}`, err);
          reject(new GitCommandError(err.message, stderr));
          return;
        }
        resolve({ stdout, stderr });
      },
    );

    opts?.token?.onCancellationRequested(() => {
      child.kill();
    });
  });
}
