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
  {
    name: "kanka-mcp-server",
    version: "0.2.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- Entity Definitions ---

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

// --- Tool Handlers ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [
    {
      name: "list_campaigns",
      description: "List all accessible campaigns",
      inputSchema: {
        type: "object",
        properties: {
          apiToken: { type: "string", description: "Optional Kanka API Token" }
        }
      }
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
    const { name, plural } = entity;
    const lowerName = name.toLowerCase();

    tools.push({
      name: `list_${plural}`,
      description: `List all ${plural} in a campaign`,
      inputSchema: {
        type: "object",
        properties: {
          campaignId: { type: "number" },
          page: { type: "number" },
          apiToken: { type: "string" }
        },
        required: ["campaignId"]
      }
    });

    tools.push({
      name: `get_${lowerName}`,
      description: `Get details of a specific ${lowerName}`,
      inputSchema: {
        type: "object",
        properties: {
          campaignId: { type: "number" },
          id: { type: "number" },
          apiToken: { type: "string" }
        },
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

  if (!token) {
    throw new Error("Missing Kanka API Token. Provide it in the SSE URL (?token=...) or in the request body.");
  }

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

    return {
      content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.response?.data?.message || error.message}` }],
      isError: true,
    };
  }
});

// --- Execution Selection ---

const isStdio = process.argv.includes("--stdio") || !process.env.PORT;

if (isStdio) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Kanka MCP Server running on Stdio");
} else {
  const app = express();
  app.use(cors());
  app.use(express.json());

  let sseTransport;

  app.get("/sse", async (req, res) => {
    sessionToken = req.query.token || "";
    if (sessionToken) {
      console.error("Session token established via SSE URL");
    }
    sseTransport = new SSEServerTransport("/message", res);
    await server.connect(sseTransport);
  });

  app.post("/message", async (req, res) => {
    if (sseTransport) {
      await sseTransport.handlePostMessage(req, res);
    } else {
      res.status(400).send("No active SSE connection");
    }
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.error(`Kanka MCP Server running on SSE at http://localhost:${PORT}`);
  });
}
