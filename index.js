import express from "express";
import axios from "axios";
import cors from "cors";
import { KANKA_API_BASE, KANKA_API_TOKEN } from "./config.js";
import { randomUUID } from "node:crypto";

const sdk = await loadSdk();

const {
  Server,
  StdioServerTransport,
  SSEServerTransport,
  StreamableHTTPServerTransport,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} = sdk;

async function loadSdk() {
  // Prefer top-level SDK export when available; fall back to subpath modules for older builds.
  try {
    return await import("@modelcontextprotocol/sdk");
  } catch (error) {
    const [server, stdio, sse, streamableHttp, types] = await Promise.all([
      import("@modelcontextprotocol/sdk/server/index.js"),
      import("@modelcontextprotocol/sdk/server/stdio.js"),
      import("@modelcontextprotocol/sdk/server/sse.js"),
      import("@modelcontextprotocol/sdk/server/streamableHttp.js"),
      import("@modelcontextprotocol/sdk/types.js"),
    ]);
    return { ...server, ...stdio, ...sse, ...streamableHttp, ...types };
  }
}

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
    { name: "kanka-mcp-server", version: "0.2.8" },
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
    console.error(`[${new Date().toISOString()}] Tool Call: ${name}`, JSON.stringify(args));
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
  app.set('trust proxy', true); // Fondamentale per Tailscale Funnel
  app.use(cors());
  app.use(express.json());
  // Custom error handler for JSON syntax errors
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] Malformed JSON from ${req.ip} to ${req.path}: ${err.message}`);
      return res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message: "Parse error: Invalid JSON was received by the server",
        },
        id: null,
      });
    }
    next(err);
  });

  const activeSessions = new Map();

  const getQueryValue = (value) => {
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const getBearerToken = (req) => {
    const headerValue = req.headers?.authorization;
    if (!headerValue || Array.isArray(headerValue)) return "";
    const match = headerValue.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
  };

  const isInitializePayload = (body) => {
    if (!body) return false;
    if (Array.isArray(body)) return body.some(item => isInitializeRequest(item));
    return isInitializeRequest(body);
  };

  app.all("/mcp", async (req, res) => {
    try {
      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(sessionIdHeader)
        ? sessionIdHeader[0]
        : sessionIdHeader;
      let transport;

      if (sessionId && activeSessions.has(sessionId)) {
        const existingTransport = activeSessions.get(sessionId);
        if (existingTransport instanceof StreamableHTTPServerTransport) {
          transport = existingTransport;
        } else {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: Session exists but uses a different transport protocol",
            },
            id: null,
          });
          return;
        }
      } else if (!sessionId && req.method === "POST" && isInitializePayload(req.body)) {
        const token = getBearerToken(req) || getQueryValue(req.query.token) || "";
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            activeSessions.set(newSessionId, transport);
          },
          onsessionclosed: (closedSessionId) => {
            if (activeSessions.get(closedSessionId) === transport) {
              activeSessions.delete(closedSessionId);
            }
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && activeSessions.get(sid) === transport) {
            activeSessions.delete(sid);
          }
        };

        const serverInstance = createKankaServer(token);
        await serverInstance.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.get("/sse", async (req, res) => {
    console.error(`[${new Date().toISOString()}] SSE Attempt...`);

    // Header per forzare lo stream diretto
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const token = getBearerToken(req) || getQueryValue(req.query.token) || "";

    // Usiamo un percorso relativo per l'endpoint dei messaggi
    const transport = new SSEServerTransport("/message", res);
    const sessionId = transport.sessionId;
    const serverInstance = createKankaServer(token);

    activeSessions.set(sessionId, transport);

    await serverInstance.connect(transport);
    console.error(`[${sessionId}] SSE Connected. Token: ${!!token}`);

    transport.onclose = () => {
      console.error(`[${sessionId}] Transport onclose triggered.`);
    };

    res.on("close", () => {
      console.error(`[${sessionId}] SSE Closed.`);
      // Teniamo la sessione viva per un po' per permettere il completamento dei POST
      setTimeout(() => {
        if (activeSessions.get(sessionId) === transport) {
          activeSessions.delete(sessionId);
        }
      }, 60000);
    });
  });

  app.post("/message", async (req, res) => {
    const sessionId = getQueryValue(req.query.sessionId);
    console.error(`[${sessionId}] POST /message received. Body keys: ${Object.keys(req.body || {})}`);
    const transport = sessionId ? activeSessions.get(sessionId) : undefined;

    if (transport instanceof SSEServerTransport) {
      await transport.handlePostMessage(req, res, req.body);
    } else if (sessionId && transport) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Session exists but uses a different transport protocol",
        },
        id: null,
      });
    } else {
      console.error(`[${sessionId}] POST Failed: Session unknown or expired.`);
      res.status(400).send("Session not found");
    }
  });

  app.post("/messages", async (req, res) => {
    const sessionId = getQueryValue(req.query.sessionId);
    const transport = sessionId ? activeSessions.get(sessionId) : undefined;

    if (transport instanceof SSEServerTransport) {
      await transport.handlePostMessage(req, res, req.body);
    } else if (sessionId && transport) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Session exists but uses a different transport protocol",
        },
        id: null,
      });
    } else {
      console.error(`[${sessionId}] POST Failed: Session unknown or expired.`);
      res.status(400).send("Session not found");
    }
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, "0.0.0.0", () => {
    console.error(`Kanka MCP Server listening on port ${PORT} (HTTP)`);
  });
}
