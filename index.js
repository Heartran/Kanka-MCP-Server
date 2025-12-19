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

/**
 * Crea un'istanza del server MCP configurata.
 * tokenOverride permette di usare il token passato via URL.
 */
function createKankaServer(tokenOverride = "") {
  const server = new Server(
    { name: "kanka-mcp-server", version: "0.2.5" },
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
    const token = req.query.token || "";

    // Header per SSE e per prevenire il buffering dei proxy (Tailscale)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Costruiamo l'URL dei messaggi usando l'host corrente (fondamentale per i tunnel)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const messageUrl = `${protocol}://${host}/message`;

    const transport = new SSEServerTransport(messageUrl, res);
    const sessionId = transport.sessionId;
    const serverInstance = createKankaServer(token);

    // Registrazione sessione PRIMA del connect per evitare race conditions
    activeSessions.set(sessionId, { transport, server: serverInstance });

    console.error(`[${sessionId}] SSE attempt... Token: ${!!token}`);

    await serverInstance.connect(transport);
    console.error(`[${sessionId}] SSE connected.`);

    // Heartbeat ogni 15s per mantenere aperta la connessione Tailscale
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keep-alive\n\n');
      }
    }, 15000);

    res.on("close", () => {
      console.error(`[${sessionId}] SSE connection closed.`);
      clearInterval(heartbeat);
      // Mantieni la sessione per 60s per gestire eventuali messaggi in coda
      setTimeout(() => activeSessions.delete(sessionId), 60000);
    });
  });

  app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId;
    const session = activeSessions.get(sessionId);

    if (session && session.transport) {
      await session.transport.handlePostMessage(req, res);
    } else {
      console.error(`[${sessionId}] POST failed: Session not found.`);
      res.status(400).send("Session not found or expired");
    }
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.error(`Kanka MCP Server listening on port ${PORT} (SSE mode)`);
  });
}
