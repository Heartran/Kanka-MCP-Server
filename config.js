// Configurazione principale per server MCP multimodale
export const PORT = process.env.PORT || 5000;

// Configurazione Kanka
export const KANKA_API_BASE = "https://api.kanka.io/1.0";
export const KANKA_API_TOKEN = process.env.KANKA_API_TOKEN || "";
export const KANKA_CLIENT_ID = process.env.KANKA_CLIENT_ID || "";
export const KANKA_CLIENT_SECRET = process.env.KANKA_CLIENT_SECRET || "";
export const KANKA_REDIRECT_URI = process.env.KANKA_REDIRECT_URI || "";

// Configurazione Revolut
export const REVOLUT_API_BASE = "https://api.revolut.com";
export const REVOLUT_CLIENT_ID = process.env.REVOLUT_CLIENT_ID || "";
export const REVOLUT_CLIENT_SECRET = process.env.REVOLUT_CLIENT_SECRET || "";
export const REVOLUT_ENVIRONMENT = process.env.REVOLUT_ENVIRONMENT || "sandbox";
export const REVOLUT_REDIRECT_URI = process.env.REVOLUT_REDIRECT_URI || "";
