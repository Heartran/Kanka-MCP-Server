# Kanka MCP Server

Minimal Model Context Protocol (MCP) proxy for the Kanka REST API using Node.js and Express.

## Setup

- Node.js 20+.
- Install dependencies: `npm install`.
- Provide a token via `export KANKA_API_TOKEN=your_token_here` (or edit `config.js`).
- Optional OAuth: set `KANKA_CLIENT_ID`, `KANKA_CLIENT_SECRET`, and `KANKA_REDIRECT_URI` (e.g. `http://localhost:5000/oauth/callback`).

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
- Pass `apiToken` in tool arguments for per-call tokens.
- Supply `Authorization: Bearer <token>` (preferred) or `?token=<token>` when initiating HTTP/SSE sessions if you prefer per-session tokens.
