#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { applyBearerToken } from "./auth-header.js";
import { getCliHelpText, parseCliArgs, parseVaultHeaders } from "./connection-overrides.js";
import { applyConfigOverrides, type RuntimeConfig, loadConfig } from "./config.js";
import { FastNoteSyncClient } from "./fns-client.js";
import { type ServerState, callTool, getTools } from "./tools.js";

type TransportMode = "stdio" | "streamable-http" | "sse";

interface ServerRuntime {
  cfg: RuntimeConfig;
  client: FastNoteSyncClient;
  state: ServerState;
  server: Server;
}

interface StreamableSession {
  runtime: ServerRuntime;
  transport: StreamableHTTPServerTransport;
  sessionId?: string;
}

interface SseSession {
  runtime: ServerRuntime;
  transport: SSEServerTransport;
  sessionId: string;
}

const INVALID_JSON = Symbol("invalid-json");
const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: string };
const SERVER_VERSION = packageJson.version ?? "0.1.3";

function createRuntime(
  baseCfg: RuntimeConfig,
  overrides: Parameters<typeof applyConfigOverrides>[1] = {},
): ServerRuntime {
  const cfg = applyConfigOverrides(baseCfg, overrides);
  const client = new FastNoteSyncClient(cfg);
  const state: ServerState = {
    activeVault: cfg.activeVault,
  };

  const server = new Server(
    {
      name: "mcp-fast-note-sync-service",
      version: SERVER_VERSION,
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

  return { cfg, client, state, server };
}

function normalizeBasePath(input: string | undefined): string {
  const raw = input?.trim() || "/mcp";
  const withPrefix = raw.startsWith("/") ? raw : `/${raw}`;
  if (withPrefix === "/") {
    return withPrefix;
  }
  return withPrefix.replace(/\/+$/, "");
}

function parsePort(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function parseTransportMode(input: string | undefined): TransportMode {
  const value = input?.trim().toLowerCase();
  if (!value || value === "stdio") {
    return "stdio";
  }
  if (value === "streamable-http" || value === "streamable" || value === "http") {
    return "streamable-http";
  }
  if (value === "sse" || value === "legacy-sse" || value === "http+sse") {
    return "sse";
  }
  console.error(`[mcp] Unknown MCP_TRANSPORT='${input}', falling back to stdio.`);
  return "stdio";
}

function toRequestUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? "localhost";
  return new URL(req.url ?? "/", `http://${host}`);
}

function applyAuthorizationToken(req: IncomingMessage, runtime: ServerRuntime): void {
  applyBearerToken(req.headers.authorization, runtime.client, runtime.cfg);
}

function writeJsonRpcError(res: ServerResponse, statusCode: number, message: string): void {
  if (res.headersSent) {
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message,
      },
      id: null,
    }),
  );
}

function writePlainError(res: ServerResponse, statusCode: number, message: string): void {
  if (res.headersSent) {
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(message);
}

async function readJsonBody(
  req: IncomingMessage,
): Promise<unknown | typeof INVALID_JSON | undefined> {
  const method = (req.method ?? "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return undefined;
  }

  const body = Buffer.concat(chunks).toString("utf-8").trim();
  if (!body) {
    return undefined;
  }

  try {
    return JSON.parse(body);
  } catch {
    return INVALID_JSON;
  }
}

async function startStdio(baseCfg: RuntimeConfig): Promise<void> {
  const runtime = createRuntime(baseCfg);
  const transport = new StdioServerTransport();
  await runtime.server.connect(transport);
  console.error("[mcp] transport=stdio");
}

async function startStreamableHttp(
  baseCfg: RuntimeConfig,
  host: string,
  port: number,
  basePath: string,
): Promise<void> {
  const sessions = new Map<string, StreamableSession>();

  const server = createServer((req, res) => {
    void (async () => {
      const url = toRequestUrl(req);
      const pathname = url.pathname;
      const method = (req.method ?? "GET").toUpperCase();

      if (pathname !== basePath) {
        writeJsonRpcError(res, 404, `Not found: ${pathname}`);
        return;
      }

      const parsedBody = await readJsonBody(req);
      if (parsedBody === INVALID_JSON) {
        writeJsonRpcError(res, 400, "Invalid JSON body");
        return;
      }

      const headerValue = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

      if (sessionId) {
        const existing = sessions.get(sessionId);
        if (!existing) {
          writeJsonRpcError(res, 404, "Session not found");
          return;
        }
        applyAuthorizationToken(req, existing.runtime);
        await existing.transport.handleRequest(req, res, parsedBody);
        return;
      }

      if (method !== "POST" || !isInitializeRequest(parsedBody)) {
        writeJsonRpcError(
          res,
          400,
          "No active session. Send an initialize request via POST without mcp-session-id.",
        );
        return;
      }

      let runtime: ServerRuntime;
      try {
        runtime = createRuntime(baseCfg, parseVaultHeaders(req.headers));
      } catch (error) {
        writeJsonRpcError(
          res,
          400,
          error instanceof Error ? error.message : "Invalid vault scope headers",
        );
        return;
      }
      applyAuthorizationToken(req, runtime);
      const createdSession: StreamableSession = {
        runtime,
        transport: new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            createdSession.sessionId = newSessionId;
            sessions.set(newSessionId, createdSession);
          },
        }),
      };

      const { transport } = createdSession;

      transport.onclose = () => {
        if (createdSession.sessionId) {
          sessions.delete(createdSession.sessionId);
        }
      };

      await runtime.server.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    })().catch((error) => {
      console.error("[mcp] streamable-http request error", error);
      writeJsonRpcError(res, 500, "Internal server error");
    });
  });

  const shutdown = (signal: string) => {
    console.error(`[mcp] Received ${signal}, shutting down streamable-http server...`);
    void (async () => {
      for (const [sessionId, session] of sessions.entries()) {
        try {
          await session.transport.close();
        } catch (error) {
          console.error(`[mcp] Failed to close session ${sessionId}`, error);
        }
      }
      server.close();
    })();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  console.error(`[mcp] transport=streamable-http listen=${host}:${port} path=${basePath}`);
}

async function startLegacySse(
  baseCfg: RuntimeConfig,
  host: string,
  port: number,
  basePath: string,
): Promise<void> {
  const messagePath = basePath === "/" ? "/messages" : `${basePath}/messages`;
  const sessions = new Map<string, SseSession>();

  const server = createServer((req, res) => {
    void (async () => {
      const url = toRequestUrl(req);
      const pathname = url.pathname;
      const method = (req.method ?? "GET").toUpperCase();

      if (method === "GET" && pathname === basePath) {
        let runtime: ServerRuntime;
        try {
          runtime = createRuntime(baseCfg, parseVaultHeaders(req.headers));
        } catch (error) {
          writePlainError(
            res,
            400,
            error instanceof Error ? error.message : "Invalid vault scope headers",
          );
          return;
        }
        applyAuthorizationToken(req, runtime);
        const transport = new SSEServerTransport(messagePath, res);
        const session: SseSession = {
          runtime,
          transport,
          sessionId: transport.sessionId,
        };
        sessions.set(session.sessionId, session);
        transport.onclose = () => {
          sessions.delete(session.sessionId);
        };
        await runtime.server.connect(transport);
        return;
      }

      if (method === "POST" && pathname === messagePath) {
        const parsedBody = await readJsonBody(req);
        if (parsedBody === INVALID_JSON) {
          writePlainError(res, 400, "Invalid JSON body");
          return;
        }

        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          writePlainError(res, 400, "Missing sessionId query parameter");
          return;
        }

        const session = sessions.get(sessionId);
        if (!session) {
          writePlainError(res, 404, "Session not found");
          return;
        }

        applyAuthorizationToken(req, session.runtime);
        await session.transport.handlePostMessage(req, res, parsedBody);
        return;
      }

      writePlainError(res, 404, "Not found");
    })().catch((error) => {
      console.error("[mcp] sse request error", error);
      writePlainError(res, 500, "Internal server error");
    });
  });

  const shutdown = (signal: string) => {
    console.error(`[mcp] Received ${signal}, shutting down sse server...`);
    void (async () => {
      for (const [sessionId, session] of sessions.entries()) {
        try {
          await session.transport.close();
        } catch (error) {
          console.error(`[mcp] Failed to close session ${sessionId}`, error);
        }
      }
      server.close();
    })();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  console.error(
    `[mcp] transport=sse listen=${host}:${port} sse=${basePath} messages=${messagePath}`,
  );
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.help) {
    console.log(getCliHelpText());
    return;
  }

  const baseCfg = loadConfig(cli.configOverrides);
  const mode = parseTransportMode(process.env.MCP_TRANSPORT);

  if (mode === "stdio") {
    await startStdio(baseCfg);
    return;
  }

  const host = process.env.MCP_HTTP_HOST?.trim() || "0.0.0.0";
  const port = parsePort(process.env.MCP_HTTP_PORT, 3000);
  const basePath = normalizeBasePath(process.env.MCP_HTTP_BASE_PATH);

  if (mode === "streamable-http") {
    await startStreamableHttp(baseCfg, host, port, basePath);
    return;
  }

  await startLegacySse(baseCfg, host, port, basePath);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
