import { McpManager } from "./mcp-manager.js";
import { createBot } from "./bot.js";
import { startScheduler } from "./scheduler.js";
import { TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, OPENROUTER_MODEL } from "./config.js";

async function main() {
  // Validate required env vars
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("Missing TELEGRAM_BOT_TOKEN in .env");
    process.exit(1);
  }
  if (!OPENROUTER_API_KEY) {
    console.error("Missing OPENROUTER_API_KEY in .env");
    process.exit(1);
  }

  console.log(`[bot] Model: ${OPENROUTER_MODEL}`);

  // Start MCP servers
  const mcpManager = new McpManager();
  await mcpManager.start();

  console.log(`[bot] ${mcpManager.getAllTools().length} tools available`);

  // Start Telegram bot
  const bot = createBot(mcpManager);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[bot] Shutting down...");
    bot.stop();
    await mcpManager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start daily task summary scheduler
  startScheduler(bot);

  console.log("[bot] Telegram bot starting...");
  bot.start();
}

main().catch((err) => {
  console.error("[bot] Fatal error:", err);
  process.exit(1);
});
