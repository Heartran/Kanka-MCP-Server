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
  headers: { "Content-Type": "application/json" },
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

function createKankaServer(tokenOverride = "") {
  const server = new Server(
    { name: "kanka-mcp-server", version: "0.2.4" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      { name: "list_campaigns", description: "List all accessible campaigns", inputSchema: { type: "object", properties: { apiToken: { type: "string" } } } },
      { name: "search", description: "Search for entities", inputSchema: { type: "object", properties: { campaignId: { type: "number" }, q: { type: "string" }, apiToken: { type: "string" } }, required: ["campaignId", "q"] } }
    ];

    entities.forEach(entity => {
      tools.push({
        name: `list_${entity.plural}`,
        description: `List all ${entity.plural}`,
        inputSchema: { type: "object", properties: { campaignId: { type: "number" }, page: { type: "number" }, apiToken: { type: "string" } }, required: ["campaignId"] }
      });
      tools.push({
        name: `get_${entity.name.toLowerCase()}`,
        description: `Get a specific ${entity.name.toLowerCase()}`,
        inputSchema: { type: "object", properties: { campaignId: { type: "number" }, id: { type: "number" }, apiToken: { type: "string" } }, required: ["campaignId", "id"] }
      });
    });

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const token = args?.apiToken || tokenOverride || KANKA_API_TOKEN;

    if (!token) throw new Error("Missing Kanka API Token.");

    try {
      let response;
      if (name === "list_campaigns") response = await kankaRequest("/campaigns", "GET", {}, {}, token);
      else if (name === "search") response = await kankaRequest(`/campaigns/${args.campaignId}/search`, "GET", {}, { q: args.q }, token);
      else {
        const listMatch = name.match(/^list_(.+)$/);
        const getMatch = name.match(/^get_(.+)$/);
        if (listMatch) response = await kankaRequest(`/campaigns/${args.campaignId}/${listMatch[1]}`, "GET", {}, { page: args.page }, token);
        else if (getMatch) {
          const entity = entities.find(e => e.name.toLowerCase() === getMatch[1]);
          if (entity) response = await kankaRequest(`/campaigns/${args.campaignId}/${entity.plural}/${args.id}`, "GET", {}, {}, token);
        }
      }

      if (!response) throw new Error(`Tool unknown: ${name}`);
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.response?.data?.message || error.message}` }], isError: true };
    }
  });

  return server;
}

const useStdio = process.argv.includes("--stdio") || !process.env.PORT;

if (useStdio) {
  const server = createKankaServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Kanka MCP Server running on Stdio");
} else {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const activeSessions = new Map();

  app.get("/sse", async (req, res) => {
    console.error(`[${new Date().toISOString()}] SSE connection attempt...`);

    // Impostiamo gli header MA NON chiamiamo res.flushHeaders() e non usiamo res.writeHead()
    // Lasciamo che SSEServerTransport.start() chiami writeHead, Express unirà questi header.
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-transform'); // Utile per alcuni proxy

    const token = req.query.token || "";
    const transport = new SSEServerTransport("/message", res);
    const serverInstance = createKankaServer(token);

    await serverInstance.connect(transport);

    const sessionId = transport.sessionId;
    activeSessions.set(sessionId, transport);

    console.error(`[${sessionId}] SSE connected. Token: ${!!token}`);

    res.on("close", () => {
      console.error(`[${sessionId}] SSE closed.`);
      activeSessions.set(sessionId, null); // Marciamo come chiusa invece di delete immediata per evitare race conditions su /message
      setTimeout(() => activeSessions.delete(sessionId), 5000);
    });
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = activeSessions.get(sessionId);

    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send("Session not found or closed");
    }
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.error(`Kanka MCP Server listening on port ${PORT} (SSE)`);
  });
}
