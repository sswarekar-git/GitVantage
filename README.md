# GitVantage

[![CI](https://github.com/sswarekar-git/GitVantage/actions/workflows/ci.yml/badge.svg)](https://github.com/sswarekar-git/GitVantage/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/sswarekar-git/GitVantage)](https://github.com/sswarekar-git/GitVantage/releases/latest)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/sswarekar-git.gitvantage)](https://marketplace.visualstudio.com/items?itemName=sswarekar-git.gitvantage)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

Fast, keyboard-friendly Git tooling for VS Code.

GitVantage adds a dedicated Git panel and log viewer on top of VS Code's built-in Git support, focused on speed and keeping your hands on the keyboard.

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sswarekar-git.gitvantage), or from the command line:

```bash
code --install-extension sswarekar-git.gitvantage
```

You can also grab the `.vsix` from a [GitHub Release](https://github.com/sswarekar-git/GitVantage/releases/latest) and install it via the Command Palette → **Extensions: Install from VSIX...**

## Features

- **Commit panel** — stage/unstage, write commit messages, and commit from a dedicated view.
- **Stash panel** — create and browse stashes.
- **Git log graph** — a branch/commit graph with file and branch details, in its own panel.
- **Blame annotations** — toggle inline blame on the current file (`GitVantage: Toggle Blame Annotations`).
- **Local history** — automatic per-file snapshots independent of git, browsable and restorable (`GitVantage: Show Local History`).
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

To try the extension locally, open this folder in VS Code and press `F5` to launch an Extension Development Host with GitVantage loaded.

To produce an installable package:

```bash
npx vsce package
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GitVantage is licensed under the [GNU General Public License v3.0 or later](LICENSE).
