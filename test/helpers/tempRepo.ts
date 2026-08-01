import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface TempRepo {
  root: string;
  git(...args: string[]): string;
  write(relativePath: string, content: string): void;
  cleanup(): void;
}

// A real, disposable git repo per test — the CLI layer just shells out to
// git, so the most trustworthy way to verify it is to run it against the
// genuine article rather than mocking child_process (which would only prove
// we call execFile with the args we think we call it with, not that those
// args do what we believe).
export function createTempRepo(): TempRepo {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitpeak-test-'));

  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'GitPeak Test');

  const write = (relativePath: string, content: string): void => {
    const full = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };

  const cleanup = (): void => {
    fs.rmSync(root, { recursive: true, force: true });
  };

  return { root, git, write, cleanup };
}

// Bare repos have no working tree, so pushing into whatever branch happens to
// be "checked out" isn't ambiguous/refused the way it is for a normal repo —
// use this as the `origin` in tests that need to push/fetch.
export function createBareRepo(): TempRepo {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitpeak-test-bare-'));
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '--bare', '-b', 'main');

  return {
    root,
    git,
    write: () => {
      throw new Error('cannot write files into a bare repo');
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
