# Kanka MCP Server

Minimal Model Context Protocol (MCP) proxy for the Kanka REST API using Node.js and Express.

## Setup

- Node.js 20+.
- Install dependencies: `npm install`.
- Provide a token via `export KANKA_API_TOKEN=your_token_here` (or edit `config.js`).

## Run modes

- STDIO (CLI/IDE): `node index.js --stdio` or `npm start -- --stdio`. This is also the default when `PORT` is unset.
- HTTP / Streamable MCP: `PORT=5000 npm start` (defaults to `5000`). You can pass `?token=<your_token>` on the first call if you do not want to rely on the env var.

## MCP endpoints

The server exposes MCP-compatible transports. Clients handle initialization and tool calls; no custom JSON endpoints are required.

Streamable HTTP (recommended, protocol 2025-11-25):
- `GET /mcp` for the SSE stream (send `Authorization: Bearer <token>` or `?token=<token>`)
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
