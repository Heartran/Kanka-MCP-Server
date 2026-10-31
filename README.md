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

The tool exposes 77 MCP tools for interacting with Kanka:

- **list_campaigns** — List all campaigns
- **search** — Search entities within a campaign
- For each entity type (Character, Location, Family, Organization, Item, Note, Event, Calendar, Timeline, Creature, Race, Quest, Map, Journal, Ability):
  - `list_<entities>` — List all
  - `get_<entity>` — Get details
  - `create_<entity>` — Create new
  - `update_<entity>` — Update existing
  - `delete_<entity>` — Delete existing

### Listing options

Big campaigns return list pages that are too large for some MCP clients to show
in full, which hides the records in the middle of the response. Every
`list_<entities>` tool takes these options to keep a page small and complete:

| Option | Values | Description |
| --- | --- | --- |
| `page` | number | Page number, default `1`. |
| `per_page` | 1–100 | Records per page. Enforced by this server, so it holds even when the Kanka API answers with a different page size. Omit it to return the API's own page untouched. |
| `entries` | boolean | Default `true`. Set `false` to drop the long `entry`/`entry_parsed` fields and get a `has_entry` boolean per record instead. |
| `entry_filter` | `all`, `empty`, `filled` | Default `all`. Keep only records whose entry is empty, or only those with text. Applied across the whole collection, not just one API page. |

When `per_page` or `entry_filter` is used, the response carries this server's own
`meta` instead of the API's:

```json
{
  "data": [{ "id": 42, "name": "Thalion", "has_entry": false }],
  "meta": {
    "page": 1,
    "per_page": 100,
    "count": 1,
    "has_more": false,
    "entry_filter": "empty",
    "entries_included": false,
    "total_unfiltered": 168,
    "api_pages_fetched": 12
  }
}
```

Notes:
- `per_page` defaults to 25 with entries, 100 without, and pages are stitched
  from as many API requests as needed.
- `total_unfiltered` is the size of the whole collection as reported by Kanka —
  it is not the number of records left after `entry_filter`. Walk pages until
  `has_more` is `false`.
- `scan_incomplete: true` means the budget of 50 API requests per call ran out
  before the window was filled, so records past that point were not scanned.

Example — find every character with no entry yet, in as few calls as possible:

```json
{ "campaignId": 235025, "per_page": 100, "entries": false, "entry_filter": "empty" }
```

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

### Claude Desktop bundle (.mcpb)

The `.mcpb` bundle is built by the `MCP bundle (.mcpb)` GitHub Actions workflow, not by hand. On every pull request it validates `manifest.json`, packs the bundle with the official `mcpb` CLI and starts it to check that it answers an MCP `initialize` request. Pushes to `main` keep the bundle as a workflow artifact, and `v*` tags attach it to the matching GitHub release.

To cut a release, bump the version in both `package.json` and `manifest.json` (CI fails if they differ), merge, then push the tag `v<version>`. The workflow creates the GitHub release for that tag if it does not exist yet and attaches the `.mcpb` to it; write the release notes by editing that release afterwards. Files that must stay out of the bundle are listed in `.mcpbignore`.

To build one locally:

```bash
npm ci --omit=dev
npx @anthropic-ai/mcpb@2.1.2 pack . kanka-mcp.mcpb
npm ci   # restore the dev dependencies (eslint, prettier) removed above
```
