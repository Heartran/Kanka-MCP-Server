# Repository Guidelines

- `index.js`: Main entry point — MCP tool running via stdio.
- `config.js`: Configuration for API token and base URL.
- `package.json`: Project metadata and dependencies.

- Install deps: `npm install` (Node 20+).
- Run tool: `KANKA_API_TOKEN=... npm start`.
- Environment: Set `KANKA_API_TOKEN` in environment variables.

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
## Identity & Git Hygiene

- Author/committer identity is managed by the repo owner; do not change git config locally (no `git config` commands). Use the existing configuration as-is. Use $ENV variables for agent-specific commits.

- Never use the Heartran git identity for commits or pushes.

- Keep commits small and topical; prefer multiple commits over one large drop when touching orthogonal areas.

## PWA & Assets

- Update `apps/pwa/public/sw.js` cache version string (o automatizza) quando alteri asset core per forzare l’update.

- Tieni manifest (`apps/pwa/public/manifest.webmanifest`) in sync con icone e theme color. Placeholder in `apps/pwa/public/icons/`.

## Railway Deploy Semantics

- Railway auto-deploy da Git puo mostrare eventi `REMOVED` in history (dedupe/cancel/queue). `REMOVED` non equivale a rollout completato e non sostituisce automaticamente il deployment attivo.

- Per controllo deterministico, considerare valido solo un servizio con `status: SUCCESS` e `deploymentId` attivo da `railway service status --json`.

- Non assumere mai che "ultimo commit visibile in history" sia la versione in esecuzione: verificare sempre il deployment attivo per singolo servizio.

## Git Identity

- Every agent should have his own git identity when committing changes in order to have a more clear and readable history

| Agent | GIT_COMMITTER_NAME / GIT_AUTHOR_NAME | GIT_COMMITTER_EMAIL / GIT_AUTHOR_EMAIL |
| --- | :---: | --- |
| Codex | Codex | [199175422+chatgpt-codex-connector[bot]@users.noreply.github.com](mailto:199175422+chatgpt-codex-connector[bot]@users.noreply.github.com) |
| Gemini | Gemini | [176961590+gemini-code-assist[bot]@users.noreply.github.com](mailto:176961590+gemini-code-assist[bot]@users.noreply.github.com) |
| Cascade | Cascade | [272510577+windsurf-cascade-agent[bot]@users.noreply.github.com](mailto:272510577+windsurf-cascade-agent[bot]@users.noreply.github.com) |
| GitHub Copilot | Copilot[bot] | [198982749+Copilot[bot]@users.noreply.github.com](mailto:198982749+Copilot[bot]@users.noreply.github.com) |
