#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { FastNoteSyncClient } from "./fns-client.js";
import { type ServerState, callTool, getTools } from "./tools.js";

const cfg = loadConfig();
const client = new FastNoteSyncClient(cfg);
const state: ServerState = {
  activeVault: cfg.activeVault,
};

const server = new Server(
  {
    name: "mcp-fast-note-sync-service",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: getTools(cfg),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: input } = request.params;
  return callTool(name, input, {
    cfg,
    client,
    state,
  });
});

const transport = new StdioServerTransport();
await server.connect(transport);
