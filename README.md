# Kanka MCP Server

Minimal Model Context Protocol (MCP) proxy for the Kanka REST API using Node.js and Express.

## Prerequisites

- Node.js 20+.
- A Kanka API token.

## Install

```bash
npm install
```

## MCP Installation Rules (client-side)

This section follows the same installation logic used in official MCP docs and official MCP servers:

- Use explicit `command`, `args`, and `env` in your client config.
- Use absolute paths for local scripts/binaries (avoid relative paths).
- Keep secrets in `env` (for example `KANKA_API_TOKEN`), not hardcoded in code/config files.
- Pick one transport for each use case:
  - local STDIO (`node index.js --stdio`)
  - remote Streamable HTTP (`/mcp`)
- Restart the MCP client after editing its MCP config.

### Option A: Local STDIO server (recommended for desktop clients)

Use a standard MCP `mcpServers` entry (same structure used by official examples):

```json
{
  "mcpServers": {
    "kanka": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/index.js", "--stdio"],
      "env": {
        "KANKA_API_TOKEN": "<YOUR_KANKA_TOKEN>"
      }
    }
  }
}
```

Notes:
- On Windows, prefer forward slashes in paths (`C:/...`) or escaped backslashes (`C:\\...`).
- Optional OAuth env vars are supported too: `KANKA_CLIENT_ID`, `KANKA_CLIENT_SECRET`, `KANKA_REDIRECT_URI`.

### Option B: Streamable HTTP server

Start the server with `PORT` set:

```bash
# Bash
PORT=5000 npm start
```

```powershell
# PowerShell
$env:PORT = "5000"
npm start
```

Then connect an MCP client to `http://127.0.0.1:5000/mcp`.
Auth can be provided using:

- `Authorization: Bearer <token>` (preferred), or
- `?token=<token>` on the first initialization request.

## Run modes

- STDIO (CLI/IDE): `node index.js --stdio` or `npm start -- --stdio`. This is also the default when `PORT` is unset.
- HTTP / Streamable MCP: `PORT=5000 npm start` (defaults to `5000`). You can pass `?token=<your_token>` on the first call if you do not want to rely on the env var.

## OAuth helper endpoints

- `GET /oauth/login`: redirect to Kanka for OAuth consent (requires `KANKA_CLIENT_ID` and `KANKA_REDIRECT_URI`).
- `GET /oauth/callback`: exchanges the returned `code` for `access_token` and `refresh_token` and returns the payload.
- `GET /.well-known/oauth-authorization-server`: OAuth metadata for MCP clients.
- `GET /oauth/authorize`: starts OAuth flow (proxying through Kanka at `app.kanka.io`).
- `POST /oauth/token`: exchanges authorization codes (and refresh tokens) for access tokens via `app.kanka.io`.

You can also override Kanka OAuth settings per request by passing `kanka_client_id`, `kanka_client_secret`, `kanka_redirect_uri`, and/or `scope` as query parameters (authorize/login) or form fields (token). When omitted, no scope is sent to Kanka (recommended).

## MCP endpoints

The server exposes MCP-compatible transports. Clients handle initialization and tool calls; no custom JSON endpoints are required.

Streamable HTTP (recommended, protocol 2025-11-25):

- `GET /mcp` (or `/` when the client expects an SSE stream) for the SSE stream (send `Authorization: Bearer <token>` or `?token=<token>`)
- `POST /mcp` for JSON-RPC requests (send `Authorization: Bearer <token>` or `?token=<token>` on the first initialize call if not using the env var)
- `DELETE /mcp` to terminate a session

Deprecated HTTP+SSE fallback (protocol 2024-11-05):

- `GET /sse` to open the SSE stream (send `Authorization: Bearer <token>` or `?token=<token>`)
- `POST /message?sessionId=<id>` to send JSON-RPC
- `POST /messages?sessionId=<id>` alias for legacy clients

Token handling:

- Set `KANKA_API_TOKEN` in the environment for a default token.
- Supply `Authorization: Bearer <token>` (preferred) or `?token=<token>` when initiating HTTP/SSE sessions if you prefer per-session tokens.

## Contributing

Community contributions are welcome.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow, coding standards, and PR checklist.
- Review [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating.
- Use the provided GitHub issue templates and PR template to keep reports and reviews consistent.

### Local quality checks

```bash
npm run lint
npm run format:check
npm test
```
