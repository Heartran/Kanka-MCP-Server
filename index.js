import express from "express";
import cors from "cors";
import { PORT } from "./config.js";

// Import routers
import { kankaRouter } from "./routers/kanka.js";
// import { revolutRouter } from "./routers/revolut.js"; // Da implementare

const app = express();

// Middleware globali
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routing multimodale
app.use('/kanka', kankaRouter);
// app.use('/revolut', revolutRouter); // Da implementare

// Discovery endpoint
app.get('/', (req, res) => {
  res.json({
    name: "MCP Multimodale Server",
    version: "1.0.0",
    services: {
      kanka: {
        endpoint: "/kanka/mcp",
        description: "Kanka RPG Campaign Management API"
      },
      revolut: {
        endpoint: "/revolut/mcp", 
        description: "Revolut Open Banking API",
        status: "coming-soon"
      }
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      kanka: "active",
      revolut: "pending"
    }
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.error(`MCP Multimodale Server listening on port ${PORT}`);
  console.error(`Services available:`);
  console.error(`- Kanka: http://localhost:${PORT}/kanka/mcp`);
  console.error(`- Health: http://localhost:${PORT}/health`);
});
