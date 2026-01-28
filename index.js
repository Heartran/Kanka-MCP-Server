import express from "express";
import axios from "axios";
import cors from "cors";
import {
  KANKA_API_BASE,
  KANKA_API_TOKEN,
  KANKA_CLIENT_ID,
  KANKA_CLIENT_SECRET,
  KANKA_REDIRECT_URI,
} from "./config.js";
import { createHash, randomUUID } from "node:crypto";

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
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const url = `${KANKA_API_BASE}${path}`;
  
  console.error(`[${timestamp}] 🔗 KANKA API REQUEST:`);
  console.error(`  📍 Method: ${method}`);
  console.error(`  🔗 URL: ${url}`);
  console.error(`  📋 Params: ${JSON.stringify(params, null, 2)}`);
  console.error(`  🔑 Token: ${token ? `${token.substring(0, 10)}...` : 'none'}`);
  
  if (data && Object.keys(data).length > 0) {
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 500) {
      console.error(`  📦 Data: ${dataSize} bytes (too large to display)`);
    } else {
      console.error(`  📦 Data: ${JSON.stringify(data, null, 2)}`);
    }
  } else {
    console.error(`  📦 Data: none`);
  }
  console.error(`  ──────────────────────────────────────────`);

  try {
    const response = await kankaClient.request({
      url: path,
      method,
      data,
      params,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    
    const responseTime = Date.now() - startTime;
    const responseTimestamp = new Date().toISOString();
    
    console.error(`[${responseTimestamp}] ✅ KANKA API RESPONSE:`);
    console.error(`  🎯 Status: ${response.status} ${response.statusText}`);
    console.error(`  ⏱️  Response Time: ${responseTime}ms`);
    console.error(`  📏 Response Size: ${JSON.stringify(response.data).length} bytes`);
    
    if (response.headers) {
      console.error(`  📋 Response Headers: ${JSON.stringify(response.headers, null, 2)}`);
    }
    
    // Log dei dati di risposta (limitato)
    const responseStr = JSON.stringify(response.data);
    if (responseStr.length > 1000) {
      console.error(`  📦 Response Data: ${responseStr.length} bytes (too large to display)`);
      // Mostra solo i primi 200 caratteri
      console.error(`  📦 Preview: ${responseStr.substring(0, 200)}...`);
    } else {
      console.error(`  📦 Response Data: ${responseStr}`);
    }
    console.error(`  ──────────────────────────────────────────`);
    
    return response;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorTimestamp = new Date().toISOString();
    
    console.error(`[${errorTimestamp}] ❌ KANKA API ERROR:`);
    console.error(`  ⏱️  Failed after: ${responseTime}ms`);
    console.error(`  🎯 Status: ${error.response?.status || 'no response'}`);
    console.error(`  💬 Message: ${error.message}`);
    console.error(`  📋 Error Details: ${JSON.stringify(error.response?.data || error, null, 2)}`);
    console.error(`  ──────────────────────────────────────────`);
    
    throw error;
  }
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
  // Bump version to reflect new write capabilities (create/update/delete).
  const server = new Server(
    { name: "kanka-mcp-server", version: "0.4.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      { name: "list_campaigns", description: "List all campaigns", inputSchema: { type: "object", properties: {} } },
      { name: "search", description: "Search entities", inputSchema: { type: "object", properties: { campaignId: { type: "number" }, q: { type: "string" } }, required: ["campaignId", "q"] } }
    ];
    entities.forEach(entity => {
      // List existing entities
      tools.push({
        name: `list_${entity.plural}`,
        description: `List ${entity.plural}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            page: { type: "number" }
          },
          required: ["campaignId"]
        }
      });

      // Get a single entity
      tools.push({
        name: `get_${entity.name.toLowerCase()}`,
        description: `Get details of a ${entity.name.toLowerCase()}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            id: { type: "number" }
          },
          required: ["campaignId", "id"]
        }
      });

      // Create a new entity
      tools.push({
        name: `create_${entity.name.toLowerCase()}`,
        description: `Create a new ${entity.name.toLowerCase()}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            data: { type: "object" }   // payload passato così com'è a Kanka
          },
          required: ["campaignId", "data"]
        }
      });

      // Update an existing entity
      tools.push({
        name: `update_${entity.name.toLowerCase()}`,
        description: `Update an existing ${entity.name.toLowerCase()}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            id: { type: "number" },
            data: { type: "object" }
          },
          required: ["campaignId", "id", "data"]
        }
      });

      // Delete an existing entity
      tools.push({
        name: `delete_${entity.name.toLowerCase()}`,
        description: `Delete an existing ${entity.name.toLowerCase()}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            id: { type: "number" }
          },
          required: ["campaignId", "id"]
        }
      });
    });
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[${new Date().toISOString()}] Tool Call: ${name}`, JSON.stringify(args));
    const finalToken = token || KANKA_API_TOKEN;
    if (!finalToken) throw new Error("Missing Kanka API Token.");

    try {
      let response;
      if (name === "list_campaigns") {
        response = await kankaRequest("/campaigns", "GET", {}, {}, finalToken);
      } else if (name === "search") {
        // Kanka search endpoint (per docs): search/{search_term}, optionally namespaced by campaign.
        const term = encodeURIComponent(args.q);
        try {
          response = await kankaRequest(`/campaigns/${args.campaignId}/search/${term}`, "GET", {}, {}, finalToken);
        } catch (err) {
          const status = err.response?.status;
          if (status === 404) {
            response = await kankaRequest(`/search/${term}`, "GET", {}, { campaign_id: args.campaignId }, finalToken);
          } else {
            throw err;
          }
        }
      }
      else {
        const listMatch = name.match(/^list_(.+)$/);
        const getMatch = name.match(/^get_(.+)$/);
        const createMatch = name.match(/^create_(.+)$/);
        const updateMatch = name.match(/^update_(.+)$/);
        const deleteMatch = name.match(/^delete_(.+)$/);

        if (listMatch) {
          // List entities (GET /campaigns/{campaignId}/{plural})
          response = await kankaRequest(
            `/campaigns/${args.campaignId}/${listMatch[1]}`,
            "GET",
            {},
            { page: args.page },
            finalToken
          );
        } else if (getMatch) {
          // Get single entity (GET /campaigns/{campaignId}/{plural}/{id})
          const entity = entities.find(e => e.name.toLowerCase() === getMatch[1]);
          if (entity) {
            response = await kankaRequest(
              `/campaigns/${args.campaignId}/${entity.plural}/${args.id}`,
              "GET",
              {},
              {},
              finalToken
            );
          }
        } else if (createMatch) {
          // Create a new entity (POST /campaigns/{campaignId}/{plural})
          const entity = entities.find(e => e.name.toLowerCase() === createMatch[1]);
          if (!args?.data || typeof args.data !== "object") {
            throw new Error("Missing or invalid 'data' for create request.");
          }
          if (entity) {
            response = await kankaRequest(
              `/campaigns/${args.campaignId}/${entity.plural}`,
              "POST",
              args.data,
              {},
              finalToken
            );
          }
        } else if (updateMatch) {
          // Update an existing entity (PUT /campaigns/{campaignId}/{plural}/{id})
          const entity = entities.find(e => e.name.toLowerCase() === updateMatch[1]);
          if (!args?.data || typeof args.data !== "object") {
            throw new Error("Missing or invalid 'data' for update request.");
          }
          if (entity) {
            response = await kankaRequest(
              `/campaigns/${args.campaignId}/${entity.plural}/${args.id}`,
              "PUT",
              args.data,
              {},
              finalToken
            );
          }
        } else if (deleteMatch) {
          // Delete an existing entity (DELETE /campaigns/{campaignId}/{plural}/{id})
          const entity = entities.find(e => e.name.toLowerCase() === deleteMatch[1]);
          if (entity) {
            response = await kankaRequest(
              `/campaigns/${args.campaignId}/${entity.plural}/${args.id}`,
              "DELETE",
              {},
              {},
              finalToken
            );
          }
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
  app.use(express.urlencoded({ extended: false }));
  
  // Middleware di logging intelligente (solo errori e richieste importanti)
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    
    // Log solo per richieste importanti o con errori
    const shouldLog = req.path === '/health' || 
                      req.path.startsWith('/oauth') || 
                      req.path.startsWith('/sse') ||
                      req.method !== 'GET' ||
                      req.headers['user-agent']?.includes('curl') ||
                      req.headers['user-agent']?.includes('wget');
    
    if (shouldLog) {
      console.error(`[${timestamp}] 📋 REQUEST: ${req.method} ${req.originalUrl} from ${clientIP}`);
      
      // Log headers solo per richieste importanti
      if (req.path.startsWith('/oauth') || req.path.startsWith('/sse')) {
        console.error(`  Headers: ${JSON.stringify(req.headers, null, 2)}`);
      }
      
      // Log body solo per POST/PUT
      if ((req.method === 'POST' || req.method === 'PUT') && req.body && Object.keys(req.body).length > 0) {
        const bodySize = JSON.stringify(req.body).length;
        if (bodySize > 500) {
          console.error(`  Body: ${bodySize} bytes`);
        } else {
          console.error(`  Body: ${JSON.stringify(req.body, null, 2)}`);
        }
      }
    }
    
    // Override res.end per catturare errori e status codes
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      const responseTimestamp = new Date().toISOString();
      const isError = res.statusCode >= 400;
      
      // Log sempre gli errori e le richieste importanti
      if (isError || shouldLog) {
        console.error(`[${responseTimestamp}] 📤 RESPONSE: ${res.statusCode} ${res.statusMessage || ''}`);
        
        if (isError) {
          // Dettagli completi per errori
          console.error(`  ❌ ERROR DETAILS:`);
          console.error(`    Status: ${res.statusCode}`);
          console.error(`    Client: ${clientIP}`);
          console.error(`    Path: ${req.originalUrl}`);
          console.error(`    Method: ${req.method}`);
          console.error(`    User-Agent: ${req.headers['user-agent'] || 'unknown'}`);
          console.error(`    Referer: ${req.headers['referer'] || 'none'}`);
          
          // Log reason specifico per status codes comuni
          const statusReasons = {
            400: 'Bad Request - Invalid request syntax or parameters',
            401: 'Unauthorized - Authentication required',
            403: 'Forbidden - Insufficient permissions',
            404: 'Not Found - Resource does not exist',
            405: 'Method Not Allowed - HTTP method not supported',
            408: 'Request Timeout - Server timed out waiting',
            429: 'Too Many Requests - Rate limit exceeded',
            500: 'Internal Server Error - Server encountered unexpected condition',
            502: 'Bad Gateway - Invalid response from upstream server',
            503: 'Service Unavailable - Server temporarily unavailable',
            504: 'Gateway Timeout - Upstream server timeout'
          };
          
          if (statusReasons[res.statusCode]) {
            console.error(`    Reason: ${statusReasons[res.statusCode]}`);
          }
          
          // Log response body per errori (se presente)
          if (chunk && chunk.length > 0) {
            try {
              const responseText = chunk.toString();
              if (responseText.length < 1000) {
                console.error(`    Response: ${responseText}`);
              } else {
                console.error(`    Response: ${responseText.substring(0, 200)}... (${responseText.length} bytes)`);
              }
            } catch (e) {
              console.error(`    Response: [binary data, ${chunk.length} bytes]`);
            }
          }
        }
      }
      
      originalEnd.call(this, chunk, encoding);
    };
    
    next();
  });
  const handleMcpRequest = async (req, res) => {
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
      } else if (req.method === "GET") {
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
  };

  app.get("/", (req, res) => {
    const accept = req.headers?.accept || "";
    if (typeof accept === "string" && accept.includes("text/event-stream")) {
      return handleMcpRequest(req, res);
    }
    res.json({ status: "ok" });
  });

  // Health check endpoint con informazioni dettagliate
  app.get("/health", (req, res) => {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    console.error(`[${timestamp}] 🏥 HEALTH CHECK REQUESTED:`);
    console.error(`  🌍 Client IP: ${req.ip}`);
    console.error(`  📋 Headers: ${JSON.stringify(req.headers, null, 2)}`);
    console.error(`  ──────────────────────────────────────────`);

    const healthData = {
      status: "healthy",
      timestamp,
      uptime: {
        seconds: Math.round(uptime),
        human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.round(uptime % 60)}s`
      },
      server: {
        version: "0.4.0",
        port: process.env.PORT || 5000,
        node_version: process.version,
        platform: process.platform
      },
      memory: {
        heap_used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heap_total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        unit: "MB"
      },
      sessions: {
        active_count: activeSessions.size,
        session_ids: Array.from(activeSessions.keys()),
        transports: Array.from(activeSessions.values()).map(t => t.constructor.name)
      },
      endpoints: {
        mcp: `/mcp`,
        sse: `/sse`,
        message: `/message`,
        messages: `/messages`,
        oauth_authorize: `/oauth/authorize`,
        oauth_token: `/oauth/token`,
        oauth_callback: `/oauth/callback`,
        well_known: `/.well-known/oauth-authorization-server`
      },
      kanka_api: {
        base_url: KANKA_API_BASE,
        token_configured: !!KANKA_API_TOKEN,
        client_configured: !!(KANKA_CLIENT_ID && KANKA_CLIENT_SECRET)
      },
      features: {
        cors_enabled: true,
        trust_proxy: true,
        verbose_logging: true
      }
    };

    res.json(healthData);
  });
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

  const oauthAuthRequests = new Map();
  const oauthAuthCodes = new Map();

  const base64Url = (buffer) => buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const sha256 = (value) => createHash("sha256").update(value).digest();
  const verifyPkce = (codeVerifier, codeChallenge, method) => {
    if (!codeChallenge) return true;
    if (!codeVerifier) return false;
    if (!method || method === "plain") return codeVerifier === codeChallenge;
    if (method === "S256") return base64Url(sha256(codeVerifier)) === codeChallenge;
    return false;
  };

  const getReqValue = (value) => {
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const getBaseUrl = (req) => `${req.protocol}://${req.get("host")}`;

  const resolveKankaConfig = (req, fallback = {}) => {
    const clientId = getReqValue(req.query?.kanka_client_id)
      || req.body?.kanka_client_id
      || KANKA_CLIENT_ID
      || getReqValue(req.query?.client_id)
      || req.body?.client_id
      || fallback.clientId;
    const clientSecret = getReqValue(req.query?.kanka_client_secret)
      || req.body?.kanka_client_secret
      || KANKA_CLIENT_SECRET
      || fallback.clientSecret;
    const redirectUri = getReqValue(req.query?.kanka_redirect_uri)
      || req.body?.kanka_redirect_uri
      || KANKA_REDIRECT_URI
      || fallback.redirectUri
      || `${getBaseUrl(req)}/oauth/callback`;
    const scope = getReqValue(req.query?.scope)
      || req.body?.scope
      || fallback.scope
      || "";

    return { clientId, clientSecret, redirectUri, scope };
  };

  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      scopes_supported: [],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  app.get("/oauth/authorize", (req, res) => {
    const {
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      response_type: responseType,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    } = req.query;

    if (responseType !== "code" || !clientId || !redirectUri) {
      return res.status(400).json({ error: "Invalid OAuth authorization request" });
    }

    const requestId = randomUUID();
    const kankaConfig = resolveKankaConfig(req);
    if (!kankaConfig.clientId || !kankaConfig.redirectUri) {
      return res.status(500).json({ error: "OAuth client not configured" });
    }

    oauthAuthRequests.set(requestId, {
      clientId,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      kankaClientId: kankaConfig.clientId,
      kankaClientSecret: kankaConfig.clientSecret,
      kankaRedirectUri: kankaConfig.redirectUri,
    });

    const params = new URLSearchParams({
      client_id: kankaConfig.clientId,
      redirect_uri: kankaConfig.redirectUri,
      response_type: "code",
      state: requestId,
    });
    if (kankaConfig.scope) {
      params.set("scope", kankaConfig.scope);
    }

    res.redirect(`https://app.kanka.io/oauth/authorize?${params.toString()}`);
  });

  app.get("/oauth/login", (req, res) => {
    const kankaConfig = resolveKankaConfig(req);
    if (!kankaConfig.clientId || !kankaConfig.redirectUri) {
      return res.status(500).json({ error: "OAuth client not configured" });
    }

    const params = new URLSearchParams({
      client_id: kankaConfig.clientId,
      redirect_uri: kankaConfig.redirectUri,
      response_type: "code",
    });
    if (kankaConfig.scope) {
      params.set("scope", kankaConfig.scope);
    }

    res.redirect(`https://app.kanka.io/oauth/authorize?${params.toString()}`);
  });

  app.get("/oauth/callback", async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const errorParam = req.query.error;
    const errorDescription = req.query.error_description;

    if (errorParam) {
      return res.status(400).json({
        error: String(errorParam),
        error_description: errorDescription ? String(errorDescription) : undefined,
      });
    }

    if (!code) {
      return res.status(400).json({ error: "Missing code parameter" });
    }

    try {
      const requestId = typeof state === "string" ? state : "";
      const request = requestId ? oauthAuthRequests.get(requestId) : null;
      const kankaConfig = resolveKankaConfig(req, {
        clientId: request?.kankaClientId,
        clientSecret: request?.kankaClientSecret,
        redirectUri: request?.kankaRedirectUri,
      });

      if (!kankaConfig.clientId || !kankaConfig.clientSecret || !kankaConfig.redirectUri) {
        return res.status(500).json({ error: "OAuth client not configured" });
      }

      const tokenResponse = await axios.post(
        "https://app.kanka.io/oauth/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: kankaConfig.clientId,
          client_secret: kankaConfig.clientSecret,
          redirect_uri: kankaConfig.redirectUri,
          code: String(code),
          ...(kankaConfig.scope ? { scope: kankaConfig.scope } : {}),
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const data = tokenResponse.data;

      if (request) {
        oauthAuthRequests.delete(requestId);
        const authCode = randomUUID();
        oauthAuthCodes.set(authCode, {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in,
          codeChallenge: request.codeChallenge,
          codeChallengeMethod: request.codeChallengeMethod,
        });

        const redirectParams = new URLSearchParams({
          code: authCode,
          state: request.state || "",
        });
        const redirectUrl = `${request.redirectUri}?${redirectParams.toString()}`;
        return res.redirect(redirectUrl);
      }

      res.json({
        token_type: data.token_type,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });
    } catch (error) {
      console.error("OAuth callback error:", error.response?.data || error.message);
      res.status(500).json({
        error: "Token exchange failed",
        details: error.response?.data || null,
      });
    }
  });

  app.post("/oauth/token", async (req, res) => {
    const grantType = req.body?.grant_type;
    const kankaConfig = resolveKankaConfig(req);

    if (grantType === "authorization_code") {
      const code = req.body?.code;
      const codeVerifier = req.body?.code_verifier;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "Missing code" });
      }
      const payload = oauthAuthCodes.get(code);
      if (!payload) {
        return res.status(400).json({ error: "Invalid or expired code" });
      }
      if (!verifyPkce(codeVerifier, payload.codeChallenge, payload.codeChallengeMethod)) {
        return res.status(400).json({ error: "Invalid code_verifier" });
      }

      oauthAuthCodes.delete(code);
      return res.json({
        token_type: "Bearer",
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken,
        expires_in: payload.expiresIn,
      });
    }

    if (grantType === "refresh_token") {
      const refreshToken = req.body?.refresh_token;
      if (!refreshToken || typeof refreshToken !== "string") {
        return res.status(400).json({ error: "Missing refresh_token" });
      }
      if (!kankaConfig.clientId || !kankaConfig.clientSecret) {
        return res.status(500).json({ error: "OAuth client not configured" });
      }

      try {
        const tokenResponse = await axios.post(
          "https://app.kanka.io/oauth/token",
          new URLSearchParams({
            grant_type: "refresh_token",
            client_id: kankaConfig.clientId,
            client_secret: kankaConfig.clientSecret,
            refresh_token: refreshToken,
            ...(kankaConfig.scope ? { scope: kankaConfig.scope } : {}),
          }),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        const data = tokenResponse.data;
        return res.json({
          token_type: data.token_type,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
        });
      } catch (error) {
        console.error("OAuth refresh error:", error.response?.data || error.message);
        return res.status(500).json({
          error: "Token refresh failed",
          details: error.response?.data || null,
        });
      }
    }

    return res.status(400).json({ error: "Unsupported grant_type" });
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

  app.all("/mcp", handleMcpRequest);

  app.get("/sse", async (req, res) => {
    const timestamp = new Date().toISOString();
    const clientIP = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    console.error(`[${timestamp}] 🌊 SSE CONNECTION ATTEMPT:`);
    console.error(`  🌍 Client IP: ${clientIP}`);
    console.error(`  🖥️  User-Agent: ${userAgent}`);
    console.error(`  ❓ Query Params: ${JSON.stringify(req.query, null, 2)}`);
    console.error(`  📋 Headers: ${JSON.stringify(req.headers, null, 2)}`);

    // Header per forzare lo stream diretto
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const token = getBearerToken(req) || getQueryValue(req.query.token) || "";
    console.error(`  🔑 Token: ${token ? `${token.substring(0, 10)}...` : 'none'}`);

    // Usiamo un percorso relativo per l'endpoint dei messaggi
    const transport = new SSEServerTransport("/message", res);
    const sessionId = transport.sessionId;
    const serverInstance = createKankaServer(token);

    activeSessions.set(sessionId, transport);
    
    console.error(`[${timestamp}] ✅ SSE SESSION CREATED:`);
    console.error(`  🆔 Session ID: ${sessionId}`);
    console.error(`  🔗 Transport: SSEServerTransport`);
    console.error(`  📊 Active Sessions: ${activeSessions.size}`);

    await serverInstance.connect(transport);
    console.error(`[${timestamp}] 🎉 SSE CONNECTED. Token: ${!!token}`);

    transport.onclose = () => {
      const closeTimestamp = new Date().toISOString();
      console.error(`[${closeTimestamp}] 🔌 SSE TRANSPORT CLOSED:`);
      console.error(`  🆔 Session ID: ${sessionId}`);
    };

    res.on("close", () => {
      const closeTimestamp = new Date().toISOString();
      console.error(`[${closeTimestamp}] 🚪 SSE CONNECTION CLOSED:`);
      console.error(`  🆔 Session ID: ${sessionId}`);
      console.error(`  📊 Active Sessions: ${activeSessions.size}`);
      // Teniamo la sessione viva per un po' per permettere il completamento dei POST
      setTimeout(() => {
        if (activeSessions.get(sessionId) === transport) {
          activeSessions.delete(sessionId);
          console.error(`[${new Date().toISOString()}] 🗑️  Session ${sessionId} cleaned up`);
        }
      }, 60000);
    });
  });

  app.post("/message", async (req, res) => {
    const sessionId = getQueryValue(req.query.sessionId);
    const timestamp = new Date().toISOString();
    const clientIP = req.ip || 'unknown';
    
    console.error(`[${timestamp}] 📨 SSE MESSAGE RECEIVED:`);
    console.error(`  🆔 Session ID: ${sessionId}`);
    console.error(`  🌍 Client IP: ${clientIP}`);
    console.error(`  📋 Headers: ${JSON.stringify(req.headers, null, 2)}`);
    console.error(`  ❓ Query Params: ${JSON.stringify(req.query, null, 2)}`);
    
    if (req.body && Object.keys(req.body).length > 0) {
      const bodySize = JSON.stringify(req.body).length;
      if (bodySize > 1000) {
        console.error(`  📦 Body: ${bodySize} bytes (too large to display)`);
        console.error(`  📦 Preview: ${JSON.stringify(req.body).substring(0, 200)}...`);
      } else {
        console.error(`  📦 Body: ${JSON.stringify(req.body, null, 2)}`);
      }
    } else {
      console.error(`  📦 Body: none or empty`);
    }
    
    const transport = sessionId ? activeSessions.get(sessionId) : undefined;

    if (transport instanceof SSEServerTransport) {
      console.error(`  ✅ Transport found: SSEServerTransport`);
      await transport.handlePostMessage(req, res, req.body);
      console.error(`  🎯 Message handled successfully`);
    } else if (sessionId && transport) {
      console.error(`  ❌ Transport mismatch: session exists but uses different protocol`);
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Session exists but uses a different transport protocol",
        },
        id: null,
      });
    } else {
      console.error(`  ❌ Session not found: ${sessionId}`);
      console.error(`  📊 Active Sessions: ${Array.from(activeSessions.keys()).join(', ')}`);
      res.status(400).send("Session not found");
    }
    console.error(`  ──────────────────────────────────────────`);
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
  
  // Statistiche in tempo reale (aggiornate solo quando cambiano)
  let lastStatsUpdate = Date.now();
  let lastSessionCount = activeSessions.size;
  let lastMemoryUsage = 0;
  
  const updateStatsIfNeeded = () => {
    const now = Date.now();
    const currentSessionCount = activeSessions.size;
    const currentMemoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    // Log solo se sono passati almeno 60 secondi O se ci sono cambiamenti significativi
    if (now - lastStatsUpdate > 60000 || 
        currentSessionCount !== lastSessionCount || 
        Math.abs(currentMemoryUsage - lastMemoryUsage) > 50) {
      
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] 📊 STATS UPDATE:`);
      console.error(`  🌐 Server: http://0.0.0.0:${PORT}`);
      console.error(`  🆔 Sessions: ${currentSessionCount} ${currentSessionCount !== lastSessionCount ? `(changed from ${lastSessionCount})` : ''}`);
      console.error(`  💾 Memory: ${currentMemoryUsage}MB ${Math.abs(currentMemoryUsage - lastMemoryUsage) > 50 ? `(changed from ${lastMemoryUsage}MB)` : ''}`);
      console.error(`  ⏱️  Uptime: ${Math.round(process.uptime())}s`);
      
      if (currentSessionCount > 0) {
        const sessionList = Array.from(activeSessions.keys()).slice(0, 5).join(', ');
        const moreText = currentSessionCount > 5 ? '...' : '';
        console.error(`  📋 Active Sessions: ${sessionList}${moreText}`);
      }
      
      lastStatsUpdate = now;
      lastSessionCount = currentSessionCount;
      lastMemoryUsage = currentMemoryUsage;
    }
  };
  
  // Aggiorna stats quando le sessioni cambiano
  setInterval(updateStatsIfNeeded, 30000); // Check ogni 30 secondi
  
  app.listen(PORT, "0.0.0.0", () => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] 🚀 KANKA MCP SERVER STARTED:`);
    console.error(`  🌐 Listening on: http://0.0.0.0:${PORT}`);
    console.error(`  🔗 HTTPS via Tailscale: https://pc-federico.tailb6c9bf.ts.net:8443`);
    console.error(`  📡 Endpoints: /sse, /mcp, /message, /health`);
    console.error(`  🔧 OAuth: /oauth/authorize, /oauth/token, /oauth/callback`);
    console.error(`  🎯 Smart Logging: ENABLED (errors + important requests only)`);
    console.error(`  📊 Real-time Stats: ENABLED`);
    console.error(`  ──────────────────────────────────────────`);
  });
}
