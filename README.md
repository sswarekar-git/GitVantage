# GitPeak

Fast, keyboard-friendly Git tooling for VS Code.

GitPeak adds a dedicated Git panel and log viewer on top of VS Code's built-in Git support, focused on speed and keeping your hands on the keyboard.

## Features

- **Commit panel** — stage/unstage, write commit messages, and commit from a dedicated view.
- **Stash panel** — create and browse stashes.
- **Git log graph** — a branch/commit graph with file and branch details, in its own panel.
- **Blame annotations** — toggle inline blame on the current file (`GitPeak: Toggle Blame Annotations`).
- **Local history** — automatic per-file snapshots independent of git, browsable and restorable (`GitPeak: Show Local History`).
- **Remote/branch management** — fetch, pull, push, prune remote-tracking branches, add remotes, switch between repositories, and a quick branch-switcher popup.

## Requirements

- VS Code `^1.90.0`
- The built-in `vscode.git` extension enabled

## Development

```bash
npm install
npm run build      # one-off build (extension host + webviews)
npm run watch       # rebuild on change
npm run typecheck    # type-check extension, webviews, and tests
npm test             # run the test suite (vitest)
```

To try the extension locally, open this folder in VS Code and press `F5` to launch an Extension Development Host with GitPeak loaded.

To produce an installable package:

```bash
npx vsce package
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GitPeak is licensed under the [GNU General Public License v3.0 or later](LICENSE).
