import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import axios from "axios";
import cors from "cors";
import { KANKA_API_BASE, KANKA_API_TOKEN } from "./config.js";

// --- Kanka Client Logic ---
const kankaClient = axios.create({
  baseURL: KANKA_API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

async function kankaRequest(path, method = "GET", data = {}, params = {}, token = "") {
  return await kankaClient.request({
    url: path,
    method,
    data,
    params,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// --- MCP Server Setup ---
const server = new Server(
  { name: "kanka-mcp-server", version: "0.2.2" },
  { capabilities: { tools: {} } }
);

const entities = [
  { name: "Character", plural: "characters" },
  { name: "Location", plural: "locations" },
  { name: "Family", plural: "families" },
  { name: "Organization", plural: "organisations" },
  { name: "Item", plural: "items" },
  { name: "Note", plural: "notes" },
  { name: "Event", plural: "events" },
  { name: "Calendar", plural: "calendars" },
  { name: "Timeline", plural: "timelines" },
  { name: "Creature", plural: "creatures" },
  { name: "Race", plural: "races" },
  { name: "Quest", plural: "quests" },
  { name: "Map", plural: "maps" },
  { name: "Journal", plural: "journals" },
  { name: "Ability", plural: "abilities" },
  { name: "Entity", plural: "entities" },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [
    {
      name: "list_campaigns",
      description: "List all accessible campaigns",
      inputSchema: { type: "object", properties: { apiToken: { type: "string" } } }
    },
    {
      name: "search",
      description: "Search for entities in a campaign",
      inputSchema: {
        type: "object",
        properties: {
          campaignId: { type: "number" },
          q: { type: "string" },
          apiToken: { type: "string" }
        },
        required: ["campaignId", "q"]
      }
    }
  ];

  entities.forEach(entity => {
    tools.push({
      name: `list_${entity.plural}`,
      description: `List all ${entity.plural} in a campaign`,
      inputSchema: {
        type: "object",
        properties: { campaignId: { type: "number" }, page: { type: "number" }, apiToken: { type: "string" } },
        required: ["campaignId"]
      }
    });
    tools.push({
      name: `get_${entity.name.toLowerCase()}`,
      description: `Get details of a specific ${entity.name.toLowerCase()}`,
      inputSchema: {
        type: "object",
        properties: { campaignId: { type: "number" }, id: { type: "number" }, apiToken: { type: "string" } },
        required: ["campaignId", "id"]
      }
    });
  });

  return { tools };
});

let sessionToken = "";

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const token = args?.apiToken || sessionToken || KANKA_API_TOKEN;

  if (!token) throw new Error("Missing Kanka API Token. Set it in the URL ?token=... or in tool arguments.");

  try {
    let response;
    if (name === "list_campaigns") {
      response = await kankaRequest("/campaigns", "GET", {}, {}, token);
    } else if (name === "search") {
      response = await kankaRequest(`/campaigns/${args.campaignId}/search`, "GET", {}, { q: args.q }, token);
    } else {
      const listMatch = name.match(/^list_(.+)$/);
      const getMatch = name.match(/^get_(.+)$/);
      if (listMatch) {
        response = await kankaRequest(`/campaigns/${args.campaignId}/${listMatch[1]}`, "GET", {}, { page: args.page }, token);
      } else if (getMatch) {
        const entityType = entities.find(e => e.name.toLowerCase() === getMatch[1]);
        if (entityType) {
          response = await kankaRequest(`/campaigns/${args.campaignId}/${entityType.plural}/${args.id}`, "GET", {}, {}, token);
        }
      }
    }

    if (!response) throw new Error(`Tool unknown: ${name}`);
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.response?.data?.message || error.message}` }], isError: true };
  }
});

// --- Startup ---
const modeStdio = process.argv.includes("--stdio") || !process.env.PORT;

if (modeStdio) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Kanka MCP Server running on Stdio");
} else {
  const app = express();
  app.use(cors());
  app.use(express.json());

  let sseTransport = null;

  app.get("/sse", async (req, res) => {
    console.error("New SSE connection attempt...");
    sessionToken = req.query.token || "";

    // Create new transport
    sseTransport = new SSEServerTransport("/message", res);

    // Connect original server to this transport
    // NOTE: This implementation supports one active remote user at a time.
    await server.connect(sseTransport);

    console.error(`SSE connected. Token present: ${!!sessionToken}`);
  });

  app.post("/message", async (req, res) => {
    if (sseTransport) {
      await sseTransport.handlePostMessage(req, res);
    } else {
      res.status(400).send("No active SSE session. Connect via /sse first.");
    }
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.error(`Kanka MCP Server listening on port ${PORT} (SSE mode)`);
  });
}
