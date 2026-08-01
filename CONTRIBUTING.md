# Contributing to GitPeak

Thanks for your interest in contributing!

## Workflow

1. Fork the repo and create a branch off `main`.
2. Make your change.
3. Before opening a PR, make sure these all pass locally:
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
4. Open a pull request against `main`. CI runs the same checks and must pass before merging.

## Code style

- TypeScript, no implicit `any`. Follow the existing patterns in the file you're editing rather than introducing new ones.
- Keep changes focused — avoid bundling unrelated refactors into a feature or fix PR.

## Reporting bugs / requesting features

Open a GitHub issue with steps to reproduce (for bugs) or a description of the use case (for feature requests).

## License

By contributing, you agree that your contributions will be licensed under the project's [GPL-3.0-or-later license](LICENSE).
