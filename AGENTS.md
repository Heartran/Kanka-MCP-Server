# Repository Guidelines

Agent Template Developed by [Heartran](https://github.com/heartran/)

- `index.js`: Main entry point for the MCP proxy server.
- `config.js`: Configuration for API tokens and base URLs.
- `package.json`: Project metadata and dependencies (Node.js/Express).

- Install deps: `npm install` (Node 20+).
- Start server: `npm start`.
- Environment: Set `KANKA_API_TOKEN` in environment variables or `config.js`.

## Coding Style & Naming Conventions
- Default to 2-space indentation in TS/JS/CSS, UTF-8 text, and trailing newlines. Use PascalCase for types/classes, camelCase for variables/functions, kebab-case for asset filenames, and snake_case for data/config files.
- Add lint/format tooling per stack (ESLint/Prettier for JS/TS, EditorConfig for mixed languages) and run before commits. Keep design docs concise and date-stamped inside the document.

- Place tests in `tests/` directory if added.
- Keep runs deterministic; avoid unnecessary real network calls in unit tests (use mocks for Kanka API).
- Document manual verification steps for new MCP endpoints.

## Commit & Pull Request Guidelines
- Use short, imperative commit messages (e.g., `Add dialogue parser`, `Fix scene load order`). Keep changes scoped and commit frequently.
- PRs should include intent, key changes, and testing performed; link related tasks/issues. Add screenshots or short clips for visual changes.
- Before opening a PR, ensure docs are updated, new commands are documented, and tests (if any) pass locally.
- All commits should be done using **your own git identity**
- Do not work directly on `main`: create a dedicated branch for any change before committing or pushing.
- You should always commits submodules **before** the main repository

## Identity & Git Hygiene
- Author/committer identity is managed by the repo owner; do not change git config locally (no `git config` commands). Use the existing configuration as-is.
- Keep commits small and topical; prefer multiple commits over one large drop when touching orthogonal areas.


- Update `README.md` or dedicated doc files when adding new MCP endpoints.

## Git Identity
- Every agent should have his own git identity when committing changes in order to have a more clear and readable history

| Agent | GIT_COMMITTER_NAME / GIT_AUTHOR_NAME | GIT_COMMITTER_EMAIL / GIT_AUTHOR_EMAIL |
| --- | :---: | --- |
| Codex | Codex | [codex@users.noreply.github.com](mailto:codex@users.noreply.github.com) |
| Gemini | Gemini | [gemini-code-assist@users.noreply.github.com](mailto:gemini-code-assist@users.noreply.github.com) |
| Cascade | Cascade | [cascade@users.noreply.github.com](mailto:cascade@users.noreply.github.com) |
| GitHub Copilot | GitHub Copilot | [github-copilot@users.noreply.github.com](mailto:github-copilot@users.noreply.github.com) |