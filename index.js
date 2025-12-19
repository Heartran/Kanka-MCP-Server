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

function createKankaServer(token) {
  const server = new Server(
    { name: "kanka-mcp-server", version: "0.2.6" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      { name: "list_campaigns", description: "List all campaigns", inputSchema: { type: "object", properties: { apiToken: { type: "string" } } } },
      { name: "search", description: "Search entities", inputSchema: { type: "object", properties: { campaignId: { type: "number" }, q: { type: "string" }, apiToken: { type: "string" } }, required: ["campaignId", "q"] } }
    ];
    entities.forEach(entity => {
      tools.push({
        name: `list_${entity.plural}`,
        description: `List ${entity.plural}`,
        inputSchema: { type: "object", properties: { campaignId: { type: "number" }, page: { type: "number" }, apiToken: { type: "string" } }, required: ["campaignId"] }
      });
      tools.push({
        name: `get_${entity.name.toLowerCase()}`,
        description: `Get details of a ${entity.name.toLowerCase()}`,
        inputSchema: { type: "object", properties: { campaignId: { type: "number" }, id: { type: "number" }, apiToken: { type: "string" } }, required: ["campaignId", "id"] }
      });
    });
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const finalToken = args?.apiToken || token || KANKA_API_TOKEN;
    if (!finalToken) throw new Error("Missing Kanka API Token.");

    try {
      let response;
      if (name === "list_campaigns") response = await kankaRequest("/campaigns", "GET", {}, {}, finalToken);
      else if (name === "search") response = await kankaRequest(`/campaigns/${args.campaignId}/search`, "GET", {}, { q: args.q }, finalToken);
      else {
        const listMatch = name.match(/^list_(.+)$/);
        const getMatch = name.match(/^get_(.+)$/);
        if (listMatch) response = await kankaRequest(`/campaigns/${args.campaignId}/${listMatch[1]}`, "GET", {}, { page: args.page }, finalToken);
        else if (getMatch) {
          const entity = entities.find(e => e.name.toLowerCase() === getMatch[1]);
          if (entity) response = await kankaRequest(`/campaigns/${args.campaignId}/${entity.plural}/${args.id}`, "GET", {}, {}, finalToken);
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.response?.data?.message || error.message}` }], isError: true };
    }
  });

  return server;
}

const useStdio = process.argv.includes("--stdio") || !process.env.PORT;

if (useStdio) {
  const server = createKankaServer(KANKA_API_TOKEN);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const activeSessions = new Map();

  app.get("/sse", async (req, res) => {
    const token = req.query.token || "";

    // Header anti-buffering per Tailscale
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // BUFFER BREAKER: Inviamo una serie di commenti per "riempire" i buffer dei proxy
    // e forzare la trasmissione immediata del primo evento.
    res.write(": padding-break-buffer" + " ".repeat(2048) + "\n\n");

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const messageUrl = `${protocol}://${host}/message`;

    const transport = new SSEServerTransport(messageUrl, res);
    const sessionId = transport.sessionId;
    const serverInstance = createKankaServer(token);

    // Registrazione sessione
    activeSessions.set(sessionId, { transport, server: serverInstance });

    console.error(`[${sessionId}] SSE Attempt (Token: ${!!token})`);

    await serverInstance.connect(transport);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 15000);

    res.on("close", () => {
      console.error(`[${sessionId}] SSE connection closed.`);
      clearInterval(heartbeat);
      // NON impostiamo a null, lasciamo che la sessione scada naturalmente dopo 2 minuti
      setTimeout(() => activeSessions.delete(sessionId), 120000);
    });
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId;
    const session = activeSessions.get(sessionId);

    if (session && session.transport) {
      await session.transport.handlePostMessage(req, res);
    } else {
      console.error(`[${sessionId}] POST failed: Session missing.`);
      res.status(400).send("Session not found");
    }
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, "0.0.0.0", () => {
    console.error(`Kanka MCP Server ready on port ${PORT} (SSE)`);
  });
}
