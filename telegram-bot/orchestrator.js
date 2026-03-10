import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mcpToolsToOpenAITools, parseToolName } from "./tools.js";
import { getHistory, addMessage } from "./session.js";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lazy-init: avoid throwing at import time if env vars aren't set yet
let _openai;
function getClient() {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: OPENROUTER_API_KEY,
    });
  }
  return _openai;
}

// Load skill files as system prompt from their original locations
const skillPaths = [
  path.join(__dirname, "..", ".claude", "skills", "ga4-analyst", "SKILL.md"),
  path.join(__dirname, "..", "clickup-mcp", "SKILLS", "ClickUp Task Creation Skill.md"),
  path.join(__dirname, "SKILLS", "daily-summary.md"),
];

const systemPrompt = [
  "You are a helpful AI assistant that manages Google Analytics and ClickUp.",
  "You have access to GA4 analytics tools and ClickUp task management tools.",
  "Use the tools available to answer the user's questions and complete their requests.",
  "When reporting data, be concise and focus on the key insights.",
  "Today's date is " + new Date().toISOString().split("T")[0] + ".",
  "",
  ...skillPaths.map((p) => {
    try { return fs.readFileSync(p, "utf8"); }
    catch { return ""; }
  }).filter(Boolean),
].join("\n\n");

const MAX_TOOL_ROUNDS = 10;

export async function handleUserMessage(chatId, userText, mcpManager) {
  addMessage(chatId, "user", userText);

  const tools = mcpToolsToOpenAITools(mcpManager);
  const messages = [
    { role: "system", content: systemPrompt },
    ...getHistory(chatId),
  ];

  // Agentic loop — let the model call tools until it produces a final text response
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().chat.completions.create({
      model: OPENROUTER_MODEL,
      max_tokens: 4096,
      messages,
      tools,
    });

    const choice = response.choices[0];
    const message = choice.message;

    // Append assistant message to conversation
    messages.push(message);

    // If no tool calls, we have a final response
    if (!message.tool_calls || message.tool_calls.length === 0) {
      const text = message.content || "";
      addMessage(chatId, "assistant", text);
      return text;
    }

    // Execute each tool call
    for (const toolCall of message.tool_calls) {
      const { serverName, toolName } = parseToolName(toolCall.function.name);
      let resultText;

      try {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await mcpManager.callTool(serverName, toolName, args);
        resultText = result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
      } catch (err) {
        resultText = `Error: ${err.message}`;
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: resultText,
      });
    }
  }

  // Safety: if we exhaust tool rounds, return what we have
  addMessage(chatId, "assistant", "I ran into a limit processing your request. Here's what I gathered so far — please try rephrasing.");
  return "I ran into a limit processing your request. Please try rephrasing.";
}
