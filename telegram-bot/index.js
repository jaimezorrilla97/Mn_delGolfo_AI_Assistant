import { McpManager } from "./mcp-manager.js";
import { createBot } from "./bot.js";
import { startScheduler } from "./scheduler.js";
import { TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, OPENROUTER_MODEL } from "./config.js";
import express from 'express';
import { closeDb } from "./session.js";
import { logger } from "./logger.js";

async function main() {
  // Validate required env vars
  if (!TELEGRAM_BOT_TOKEN) {
    logger.error("bot", "Missing TELEGRAM_BOT_TOKEN in .env");
    process.exit(1);
  }
  if (!OPENROUTER_API_KEY) {
    logger.error("bot", "Missing OPENROUTER_API_KEY in .env");
    process.exit(1);
  }

  logger.info("bot", `Model: ${OPENROUTER_MODEL}`);

  // Start MCP servers
  const mcpManager = new McpManager();
  await mcpManager.start();

  logger.info("bot", `${mcpManager.getAllTools().length} tools available`);

  // Start Telegram bot
  const bot = createBot(mcpManager);

  // Start health check server
  const app = express();
  app.get('/health', (req, res) => res.status(200).send('OK'));
  const port = process.env.PORT || 8080;
  const httpServer = app.listen(port, () => {
    logger.info("health", `Server listening on port ${port}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("bot", "Shutting down...");
    
    // Create a 10s timeout promise
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Shutdown timeout')), 10000);
    });

    try {
      await Promise.race([
        (async () => {
          bot.stop();
          await mcpManager.shutdown();
          httpServer.close();
          closeDb();
        })(),
        timeout
      ]);
    } catch (err) {
      logger.error("bot", "Error during shutdown", err.message);
    } finally {
      clearTimeout(timeoutId);
      process.exit(0);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start daily task summary scheduler
  startScheduler(bot);

  logger.info("bot", "Telegram bot starting...");
  bot.start();
}

main().catch((err) => {
  logger.error("bot", "Fatal error", err.message);
  process.exit(1);
});
