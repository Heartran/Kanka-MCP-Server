# Kanka MCP Server

Minimal Model Context Protocol (MCP) proxy for the Kanka REST API using Node.js and Express.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set your Kanka token in the environment:

```bash
export KANKA_API_TOKEN=your_token_here
```

3. Start the server (defaults to port 5000):

```bash
npm start
```

## Available MCP-style endpoints

All endpoints accept JSON payloads.

- `POST /mcp/echo` — returns the received payload.
- `POST /mcp/fetchCharacters` — body: `{ "campaignId": "<id>", "page": 1 }`.
- `POST /mcp/fetchLocations` — body: `{ "campaignId": "<id>", "page": 1 }`.

Responses mirror the Kanka REST API payloads.
