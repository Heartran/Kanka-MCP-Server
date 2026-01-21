import express from "express";
import axios from "axios";
import cors from "cors";
import {
  KANKA_API_BASE,
  KANKA_API_TOKEN,
  KANKA_CLIENT_ID,
  KANKA_CLIENT_SECRET,
  KANKA_REDIRECT_URI,
} from "../config.js";
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
