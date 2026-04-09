#!/usr/bin/env node

import axios from "axios";
import { KANKA_API_BASE } from "./config.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// --- Kanka Client Logic ---
const kankaClient = axios.create({
  baseURL: KANKA_API_BASE,
  headers: { "Content-Type": "application/json" },
});

async function kankaRequest(path, method = "GET", data = {}, params = {}, token = "") {
  const startTime = Date.now();
  console.error(`[kanka] ${method} ${KANKA_API_BASE}${path}`);

  try {
    const response = await kankaClient.request({
      url: path,
      method,
      data,
      params,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    console.error(`[kanka] ${response.status} (${Date.now() - startTime}ms)`);
    return response;
  } catch (error) {
    console.error(`[kanka] ERROR ${error.response?.status || "no response"} (${Date.now() - startTime}ms): ${error.message}`);
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
];

const globalKankaApiToken = process.env.KANKA_API_TOKEN || "";

async function createKankaServer() {
  const server = new Server(
    { name: "kanka-mcp-server", version: "2.0.3" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      { name: "list_campaigns", description: "List all campaigns", inputSchema: { type: "object", properties: {} } },
      { name: "search", description: "Search entities", inputSchema: { type: "object", properties: { campaignId: { type: "number" }, q: { type: "string" } }, required: ["campaignId", "q"] } },
    ];
    entities.forEach((entity) => {
      tools.push({
        name: `list_${entity.plural}`,
        description: `List ${entity.plural}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            page: { type: "number" },
          },
          required: ["campaignId"],
        },
      });

      tools.push({
        name: `get_${entity.name.toLowerCase()}`,
        description: `Get details of a ${entity.name.toLowerCase()}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            id: { type: "number" },
          },
          required: ["campaignId", "id"],
        },
      });

      tools.push({
        name: `create_${entity.name.toLowerCase()}`,
        description: `Create a new ${entity.name.toLowerCase()}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            data: { type: "object" },
          },
          required: ["campaignId", "data"],
        },
      });

      tools.push({
        name: `update_${entity.name.toLowerCase()}`,
        description: `Update an existing ${entity.name.toLowerCase()}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            id: { type: "number" },
            data: { type: "object" },
          },
          required: ["campaignId", "id", "data"],
        },
      });

      tools.push({
        name: `delete_${entity.name.toLowerCase()}`,
        description: `Delete an existing ${entity.name.toLowerCase()}`,
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number" },
            id: { type: "number" },
          },
          required: ["campaignId", "id"],
        },
      });
    });
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[tool] ${name} ${JSON.stringify(args)}`);

    if (!globalKankaApiToken) {
      throw new Error("Missing Kanka API Token. Please configure it in the MCP settings or set KANKA_API_TOKEN environment variable.");
    }

    try {
      let response;
      if (name === "list_campaigns") {
        response = await kankaRequest("/campaigns", "GET", {}, {}, globalKankaApiToken);
      } else if (name === "search") {
        const term = encodeURIComponent(args.q);
        try {
          response = await kankaRequest(`/campaigns/${args.campaignId}/search/${term}`, "GET", {}, {}, globalKankaApiToken);
        } catch (err) {
          if (err.response?.status === 404) {
            response = await kankaRequest(`/search/${term}`, "GET", {}, { campaign_id: args.campaignId }, globalKankaApiToken);
          } else {
            throw err;
          }
        }
      } else {
        const listMatch = name.match(/^list_(.+)$/);
        const getMatch = name.match(/^get_(.+)$/);
        const createMatch = name.match(/^create_(.+)$/);
        const updateMatch = name.match(/^update_(.+)$/);
        const deleteMatch = name.match(/^delete_(.+)$/);

        if (listMatch) {
          response = await kankaRequest(
            `/campaigns/${args.campaignId}/${listMatch[1]}`,
            "GET",
            {},
            { page: args.page },
            globalKankaApiToken
          );
        } else if (getMatch) {
          const entity = entities.find((e) => e.name.toLowerCase() === getMatch[1]);
          if (!entity) throw new Error(`Unknown entity type: ${getMatch[1]}`);
          response = await kankaRequest(
            `/campaigns/${args.campaignId}/${entity.plural}/${args.id}`,
            "GET",
            {},
            {},
            globalKankaApiToken
          );
        } else if (createMatch) {
          const entity = entities.find((e) => e.name.toLowerCase() === createMatch[1]);
          if (!entity) throw new Error(`Unknown entity type: ${createMatch[1]}`);
          if (!args?.data || typeof args.data !== "object") {
            throw new Error("Missing or invalid 'data' for create request.");
          }
          response = await kankaRequest(
            `/campaigns/${args.campaignId}/${entity.plural}`,
            "POST",
            args.data,
            {},
            globalKankaApiToken
          );
        } else if (updateMatch) {
          const entity = entities.find((e) => e.name.toLowerCase() === updateMatch[1]);
          if (!entity) throw new Error(`Unknown entity type: ${updateMatch[1]}`);
          if (!args?.data || typeof args.data !== "object") {
            throw new Error("Missing or invalid 'data' for update request.");
          }
          response = await kankaRequest(
            `/campaigns/${args.campaignId}/${entity.plural}/${args.id}`,
            "PUT",
            args.data,
            {},
            globalKankaApiToken
          );
        } else if (deleteMatch) {
          const entity = entities.find((e) => e.name.toLowerCase() === deleteMatch[1]);
          if (!entity) throw new Error(`Unknown entity type: ${deleteMatch[1]}`);
          response = await kankaRequest(
            `/campaigns/${args.campaignId}/${entity.plural}/${args.id}`,
            "DELETE",
            {},
            {},
            globalKankaApiToken
          );
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.response?.data?.message || error.message}` }], isError: true };
    }
  });

  return server;
}

// --- Error handling ---
process.on("unhandledRejection", (reason, promise) => {
  console.error("[kanka-mcp] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[kanka-mcp] Uncaught Exception:", error);
});

// --- Start stdio transport ---
try {
  const server = await createKankaServer();
  const transport = new StdioServerTransport();

  transport.onerror = (error) => {
    console.error("[kanka-mcp] Transport error:", error);
  };

  transport.onclose = () => {
    console.error("[kanka-mcp] Transport closed");
  };

  await server.connect(transport);
  console.error("[kanka-mcp] Server running on stdio");
} catch (error) {
  console.error("[kanka-mcp] Failed to start server:", error);
  process.exit(1);
}
