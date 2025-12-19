import express from "express";
import axios from "axios";
import { KANKA_API_BASE, KANKA_API_TOKEN } from "./config.js";

const app = express();
app.use(express.json());

if (!KANKA_API_TOKEN) {
  console.warn("[warn] KANKA_API_TOKEN is not set. Set it before making API requests.");
}

const kankaClient = axios.create({
  baseURL: KANKA_API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

async function kankaRequest(path, method = "GET", data = {}, params = {}, token = "") {
  const response = await kankaClient.request({
    url: path,
    method,
    data,
    params,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  return response;
}

app.get("/", (req, res) => {
  res.send("Kanka MCP Server is running.");
});

app.post("/mcp/echo", (req, res) => {
  res.json({ success: true, received: req.body });
});

// --- Generic Handlers ---

async function handleRequest(req, res, path, method) {
  const { campaignId, id, entityId, page, apiToken, ...data } = req.body;
  const token = apiToken || KANKA_API_TOKEN;

  if (!token) {
    return res.status(401).json({ error: "Missing Kanka API Token. Provide 'apiToken' in request or set KANKA_API_TOKEN env var." });
  }

  if (!campaignId && path !== "campaigns" && path !== "search") {
    return res.status(400).json({ error: "campaignId is required" });
  }

  let finalPath = path === "campaigns" ? "/campaigns" : `/campaigns/${campaignId}/${path}`;
  if (id && !finalPath.endsWith(id)) finalPath += `/${id}`;

  try {
    const response = await kankaRequest(finalPath, method, data, { page }, token);
    res.status(response.status).send(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).send(error.response.data);
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}

// --- Resource Registration ---

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

entities.forEach((entity) => {
  const { name, plural } = entity;
  // List
  app.post(`/mcp/list${name}s`, (req, res) => handleRequest(req, res, plural, "GET"));
  // Get
  app.post(`/mcp/get${name}`, (req, res) => handleRequest(req, res, plural, "GET"));
  // Create
  app.post(`/mcp/create${name}`, (req, res) => handleRequest(req, res, plural, "POST"));
  // Update
  app.post(`/mcp/update${name}`, (req, res) => handleRequest(req, res, plural, "PATCH"));
  // Delete
  app.post(`/mcp/delete${name}`, (req, res) => handleRequest(req, res, plural, "DELETE"));
});

// --- Sub-resource Handlers ---

const subResources = [
  { name: "Relation", plural: "relations" },
  { name: "Attribute", plural: "attributes" },
  { name: "Inventory", plural: "inventory" },
  { name: "EntityAbility", plural: "entity_abilities" },
  { name: "Post", plural: "posts" },
  { name: "EntityAsset", plural: "entity_assets" },
  { name: "EntityEvent", plural: "entity_events" },
];

subResources.forEach((sub) => {
  const { name, plural } = sub;
  const pathPrefix = (entityId) => `entities/${entityId}/${plural}`;

  app.post(`/mcp/listEntity${name}s`, (req, res) => {
    const { entityId } = req.body;
    if (!entityId) return res.status(400).json({ success: false, error: "entityId is required" });
    return handleRequest(req, res, pathPrefix(entityId), "GET");
  });

  app.post(`/mcp/createEntity${name}`, (req, res) => {
    const { entityId } = req.body;
    if (!entityId) return res.status(400).json({ success: false, error: "entityId is required" });
    return handleRequest(req, res, pathPrefix(entityId), "POST");
  });

  app.post(`/mcp/updateEntity${name}`, (req, res) => {
    const { entityId, id } = req.body;
    if (!entityId || !id) return res.status(400).json({ success: false, error: "entityId and id are required" });
    return handleRequest(req, res, `${pathPrefix(entityId)}/${id}`, "PATCH");
  });

  app.post(`/mcp/deleteEntity${name}`, (req, res) => {
    const { entityId, id } = req.body;
    if (!entityId || !id) return res.status(400).json({ success: false, error: "entityId and id are required" });
    return handleRequest(req, res, `${pathPrefix(entityId)}/${id}`, "DELETE");
  });
});

// Specific sub-resources
app.post("/mcp/listOrganizationMembers", (req, res) => {
  const { campaignId, id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: "id (organisation id) is required" });
  return handleRequest(req, res, `organisations/${id}/organisation_members`, "GET");
});

app.post("/mcp/search", (req, res) => {
  const { campaignId, q } = req.body;
  if (!q) return res.status(400).json({ success: false, error: "query 'q' is required" });
  return handleRequest(req, res, `search`, "GET", {}, { q });
});

app.post("/mcp/fetchCampaigns", (req, res) => handleRequest(req, res, "campaigns", "GET"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MCP -> Kanka server alive on ${PORT}`);
});
