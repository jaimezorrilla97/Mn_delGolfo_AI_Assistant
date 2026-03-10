import { Bot } from "grammy";
import { TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_IDS, GROQ_API_KEY } from "./config.js";
import { handleUserMessage } from "./orchestrator.js";
import { clearHistory } from "./session.js";
import { transcribeVoice } from "./voice.js";
import { logger } from "./logger.js";

const TELEGRAM_MAX_LENGTH = 4096;

export function createBot(mcpManager) {
  const bot = new Bot(TELEGRAM_BOT_TOKEN);

  // Auth middleware — restrict to allowed chat IDs
  bot.use(async (ctx, next) => {
    if (
      ALLOWED_CHAT_IDS.length > 0 &&
      !ALLOWED_CHAT_IDS.includes(ctx.chat?.id)
    ) {
      return ctx.reply("Unauthorized.");
    }
    await next();
  });

  // /start command
  bot.command("start", (ctx) => {
    ctx.reply(
      "Hey! I'm your AI assistant for Google Analytics and ClickUp.\n\n" +
      "Ask me anything about your analytics data or tell me to create/manage ClickUp tasks.\n\n" +
      "Commands:\n" +
      "/clear — Reset conversation history\n" +
      "/model — Show current AI model"
    );
  });

  // /clear command
  bot.command("clear", (ctx) => {
    clearHistory(ctx.chat.id);
    ctx.reply("Conversation cleared.");
  });

  // /model command — show which model is active
  bot.command("model", async (ctx) => {
    const { OPENROUTER_MODEL } = await import("./config.js");
    ctx.reply(`Current model: ${OPENROUTER_MODEL}`);
  });

  // Handle text messages
  bot.on("message:text", async (ctx) => {
    const userText = ctx.message.text;
    await processUserMessage(ctx, userText, mcpManager);
  });

  // Handle voice notes
  bot.on("message:voice", async (ctx) => {
    if (!GROQ_API_KEY) {
      await ctx.reply("Voice notes are not configured. Add GROQ_API_KEY to .env.");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");

      // Download voice file from Telegram
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      const response = await fetch(fileUrl);
      const audioBuffer = Buffer.from(await response.arrayBuffer());

      // Transcribe with Groq Whisper
      const transcription = await transcribeVoice(audioBuffer);

      if (!transcription) {
        await ctx.reply("Couldn't transcribe the voice note. Please try again or type your message.");
        return;
      }

      // Show the user what was heard
      await ctx.reply(`🎤 _${transcription}_`, { parse_mode: "Markdown" }).catch(() =>
        ctx.reply(`Voice: ${transcription}`)
      );

      // Process as a normal message
      await processUserMessage(ctx, transcription, mcpManager);
    } catch (err) {
      logger.error("bot", "Error handling voice", err.message);
      await ctx.reply("Something went wrong processing your voice note. Please try again.");
    }
  });

  return bot;
}

// Shared message processing logic
async function processUserMessage(ctx, userText, mcpManager) {
  const chatId = ctx.chat.id;

  try {
    await ctx.replyWithChatAction("typing");

    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("typing").catch(() => {});
    }, 4000);

    let reply;
    try {
      reply = await handleUserMessage(chatId, userText, mcpManager);
    } finally {
      clearInterval(typingInterval);
    }

    if (!reply) {
      await ctx.reply("I processed your request but got an empty response. Please try again.");
      return;
    }

    if (reply.length <= TELEGRAM_MAX_LENGTH) {
      await ctx.reply(reply, { parse_mode: "Markdown" }).catch(() =>
        ctx.reply(reply)
      );
    } else {
      const chunks = splitMessage(reply, TELEGRAM_MAX_LENGTH);
      for (const chunk of chunks) {
        await ctx.reply(chunk).catch(() => {});
      }
    }
  } catch (err) {
    logger.error("bot", "Error handling message", err.message);
    await ctx.reply("Something went wrong. Please try again.");
  }
}

// Split a long message into chunks, trying to break at newlines
function splitMessage(text, maxLen) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to break at the last newline within the limit
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx <= 0) {
      splitIdx = maxLen;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}
