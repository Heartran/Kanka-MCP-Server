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
    { name: "kanka-mcp-server", version: "0.2.7" },
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
        description: `List ${entity.plural} in campaign`,
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
    console.error(`[${new Date().toISOString()}] SSE connection request`);

    const token = req.query.token || "";

    // Configura gli header INSIEME (senza inviarli ancora con write)
    // Usiamo res.setHeader invece di res.write() per evitare il crash
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const messageUrl = `${protocol}://${host}/message`;

    // Lasciamo che SSEServerTransport gestisca l'invio degli header e l'inizializzazione
    const transport = new SSEServerTransport(messageUrl, res);
    const sessionId = transport.sessionId;
    const serverInstance = createKankaServer(token);

    // Registrazione sessione
    activeSessions.set(sessionId, { transport, server: serverInstance });

    try {
      await serverInstance.connect(transport);
      console.error(`[${sessionId}] SSE connected. Token: ${!!token}`);

      // Heartbeat a basso livello (solo se la connessione è aperta)
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': keep-alive\n\n');
        }
      }, 15000);

      res.on("close", () => {
        clearInterval(heartbeat);
        console.error(`[${sessionId}] SSE closed.`);
        setTimeout(() => activeSessions.delete(sessionId), 120000);
      });
    } catch (error) {
      console.error(`[${sessionId}] Connection error:`, error);
      activeSessions.delete(sessionId);
    }
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId;
    const session = activeSessions.get(sessionId);

    if (session && session.transport) {
      await session.transport.handlePostMessage(req, res);
    } else {
      res.status(400).send("Session not found");
    }
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, "0.0.0.0", () => {
    console.error(`Kanka MCP Server listening on port ${PORT} (SSE)`);
  });
}
