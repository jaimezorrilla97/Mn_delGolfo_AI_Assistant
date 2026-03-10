import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCP_SERVERS } from "./config.js";
import { logger } from "./logger.js";

export class McpManager {
  constructor() {
    this.clients = new Map(); // name -> { client, transport, tools[], serverDef }
  }

  async start() {
    for (const serverDef of MCP_SERVERS) {
      await this._connectServer(serverDef);
    }
  }

  async _connectServer(serverDef) {
    const transport = new StdioClientTransport({
      command: serverDef.command,
      args: serverDef.args,
      env: process.env,
    });

    const client = new Client({
      name: "telegram-bot",
      version: "1.0.0",
    });

    await client.connect(transport);
    const { tools } = await client.listTools();

    this.clients.set(serverDef.name, { client, transport, tools, serverDef });
    logger.info("mcp", `"${serverDef.name}" connected — ${tools.length} tools`);
  }

  getAllTools() {
    const all = [];
    for (const [serverName, { tools }] of this.clients) {
      for (const tool of tools) {
        all.push({ serverName, ...tool });
      }
    }
    return all;
  }

  async callTool(serverName, toolName, args) {
    const entry = this.clients.get(serverName);
    if (!entry) throw new Error(`Unknown MCP server: ${serverName}`);

    const result = await entry.client.callTool({
      name: toolName,
      arguments: args,
    });
    return result;
  }

  async shutdown() {
    for (const [name, { client }] of this.clients) {
      try {
        await client.close();
        logger.info("mcp", `"${name}" disconnected`);
      } catch (err) {
        logger.error("mcp", `Error closing "${name}"`, err.message);
      }
    }
  }
}
