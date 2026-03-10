import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Only try to load .env if it exists (local development)
try {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
} catch (e) {
  // Ignore in production
}

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4-20250514";
export const GROQ_API_KEY = process.env.GROQ_API_KEY;
export const ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS
  ? process.env.ALLOWED_CHAT_IDS.split(",").map(Number)
  : [];

// ClickUp config (used by scheduler)
export const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;
export const CLICKUP_ECOMMERCE_LIST_ID = process.env.CLICKUP_ECOMMERCE_LIST_ID;
export const CLICKUP_MARKETING_LIST_ID = process.env.CLICKUP_MARKETING_LIST_ID;

// MCP Server Registry — add new servers here
export const MCP_SERVERS = [
  {
    name: "ga4",
    command: process.execPath,
    args: [path.join(__dirname, "..", "ga4-mcp", "server.js")],
  },
  {
    name: "clickup",
    command: process.execPath,
    args: [path.join(__dirname, "..", "clickup-mcp", "server.js")],
  },
];
