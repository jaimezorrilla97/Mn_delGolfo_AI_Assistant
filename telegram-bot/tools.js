// Converts MCP tool schemas to OpenAI-compatible tool definitions (used by OpenRouter)

export function mcpToolsToOpenAITools(mcpManager) {
  const allTools = mcpManager.getAllTools();

  return allTools.map((tool) => ({
    type: "function",
    function: {
      name: `${tool.serverName}__${tool.name}`,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

// Parse a prefixed tool name back into serverName + toolName
export function parseToolName(prefixedName) {
  const idx = prefixedName.indexOf("__");
  return {
    serverName: prefixedName.slice(0, idx),
    toolName: prefixedName.slice(idx + 2),
  };
}
