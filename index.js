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
    Authorization: `Bearer ${KANKA_API_TOKEN}`,
  },
});

async function kankaRequest(path, method = "GET", data = {}, params = {}) {
  const response = await kankaClient.request({
    url: path,
    method,
    data,
    params,
  });

  return response.data;
}

app.post("/mcp/echo", (req, res) => {
  res.json({ success: true, received: req.body });
});

app.post("/mcp/fetchCharacters", async (req, res) => {
  const { campaignId, page = 1 } = req.body;

  if (!campaignId) {
    return res.status(400).json({ success: false, error: "campaignId is required" });
  }

  try {
    const data = await kankaRequest(`/campaigns/${campaignId}/characters`, "GET", {}, { page });
    res.json({ success: true, data });
  } catch (error) {
    console.error("[fetchCharacters]", error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || error.message,
    });
  }
});

app.post("/mcp/fetchLocations", async (req, res) => {
  const { campaignId, page = 1 } = req.body;

  if (!campaignId) {
    return res.status(400).json({ success: false, error: "campaignId is required" });
  }

  try {
    const data = await kankaRequest(`/campaigns/${campaignId}/locations`, "GET", {}, { page });
    res.json({ success: true, data });
  } catch (error) {
    console.error("[fetchLocations]", error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || error.message,
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MCP -> Kanka server alive on ${PORT}`);
});
