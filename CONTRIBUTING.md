# Contributing to Kanka MCP Server

Thanks for helping improve Kanka MCP Server! This guide explains how to contribute in a predictable and review-friendly way.

## Development setup

1. Use **Node.js 20+**.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure authentication:
   - Preferred: export `KANKA_API_TOKEN` in your shell.
   - Alternative: edit `config.js` for local development.

4. Start the server:

   ```bash
   npm start
   ```

## Branch and commit workflow

- Create a dedicated branch for each change.
- Keep commits focused and use short, imperative messages.
- Update docs when changing behavior, endpoints, or contributor workflows.

Example commit messages:

- `Add issue templates`
- `Document local test workflow`
- `Fix token extraction from headers`

## Code style

- JavaScript uses 2-space indentation and UTF-8 text files.
- Run linting and formatting checks before opening a PR:

  ```bash
  npm run lint
  npm run format:check
  ```

- Auto-fix formatting with:

  ```bash
  npm run format
  ```

## Testing

Current checks:

```bash
npm test
```

Guidelines:

- Put new tests inside `tests/`.
- Keep tests deterministic.
- Avoid real Kanka network calls in unit tests by using mocks or stubs.

## Pull request checklist

Before opening a PR, please verify:

- [ ] The branch is up to date with the target branch.
- [ ] Lint/format checks pass locally.
- [ ] Tests pass locally.
- [ ] README and/or docs are updated for user-visible changes.
- [ ] The PR description explains intent, key changes, and test evidence.

## Manual verification for MCP endpoint changes

If your change modifies an MCP endpoint or tool behavior, include manual steps in your PR body, for example:

1. Run server in streamable mode: `PORT=5000 npm start`
2. Call `POST /mcp` initialize request with a valid token.
3. Verify `tools/list` includes the new or updated tool.
4. Call the tool and include request/response excerpts in the PR.

Thanks again for contributing! 🚀
