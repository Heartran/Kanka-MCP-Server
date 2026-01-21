import express from "express";
import { createKankaServer } from "../kanka/kanka-server.js";
import {
  KANKA_API_TOKEN,
  KANKA_CLIENT_ID,
  KANKA_CLIENT_SECRET,
  KANKA_REDIRECT_URI
} from "../config.js";

const router = express.Router();
const activeSessions = new Map();

// MCP endpoint per Kanka
router.all('/mcp', async (req, res) => {
  try {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader)
      ? sessionIdHeader[0]
      : sessionIdHeader;

    // Gestione token (Bearer o query parameter)
    const getBearerToken = (req) => {
      const headerValue = req.headers?.authorization;
      if (!headerValue || Array.isArray(headerValue)) return "";
      const match = headerValue.match(/^Bearer\s+(.+)$/i);
      return match ? match[1].trim() : "";
    };

    const getQueryValue = (value) => {
      if (Array.isArray(value)) return value[0];
      return value;
    };

    const token = getBearerToken(req) || getQueryValue(req.query.token) || KANKA_API_TOKEN;

    // Logica MCP esistente (da spostare da kanka-server.js)
    // Per ora, endpoint base di test
    res.json({
      service: "kanka",
      endpoint: "/mcp",
      token_provided: !!token,
      session_id: sessionId || "none"
    });

  } catch (error) {
    console.error("Kanka MCP Error:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal server error",
      },
      id: null,
    });
  }
});

// OAuth endpoints per Kanka (da spostare da kanka-server.js)
router.get('/oauth/login', (req, res) => {
  res.json({
    service: "kanka",
    endpoint: "/oauth/login",
    message: "OAuth login endpoint - to be implemented"
  });
});

router.get('/oauth/callback', (req, res) => {
  res.json({
    service: "kanka", 
    endpoint: "/oauth/callback",
    message: "OAuth callback endpoint - to be implemented"
  });
});

export { kankaRouter };
