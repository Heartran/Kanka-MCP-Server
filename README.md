# Kanka MCP Tool

Local MCP tool for the Kanka worldbuilding API. Runs on your machine via stdio — no remote server needed.

## Prerequisites

- Node.js 20+.
- A Kanka API token (get one at [kanka.io/en/settings/api](https://kanka.io/en/settings/api)).

## Install

```bash
npm install
```

## Usage

### MCP client configuration (Claude Desktop, Cursor, etc.)

Add this to your MCP client config:

```json
{
  "mcpServers": {
    "kanka": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/index.js"],
      "env": {
        "KANKA_API_TOKEN": "<YOUR_KANKA_TOKEN>"
      }
    }
  }
}
```

Notes:
- Replace `<ABSOLUTE_PATH_TO_REPO>` with the full path to this repository.
- On Windows, prefer forward slashes (`C:/Users/...`) or escaped backslashes (`C:\\Users\\...`).
- Restart the MCP client after editing the config.

### Run directly

```bash
KANKA_API_TOKEN=your_token npm start
```

### Install globally

```bash
npm install -g .
KANKA_API_TOKEN=your_token kanka-mcp
```

## Available tools

The tool exposes 82 MCP tools for interacting with Kanka:

- **list_campaigns** — List all campaigns
- **search** — Search entities within a campaign
- For each entity type (Character, Location, Family, Organization, Item, Note, Event, Calendar, Timeline, Creature, Race, Quest, Map, Journal, Ability, Entity):
  - `list_<entities>` — List all
  - `get_<entity>` — Get details
  - `create_<entity>` — Create new
  - `update_<entity>` — Update existing
  - `delete_<entity>` — Delete existing

## Contributing

Community contributions are welcome.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow, coding standards, and PR checklist.
- Review [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating.

### Local quality checks

```bash
npm run lint
npm run format:check
npm test
```
