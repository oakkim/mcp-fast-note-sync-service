import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RuntimeConfig } from "./config.js";
import { isVaultAllowed, normalizeVault } from "./config.js";
import { type FastNoteSyncClient, toInputRecord } from "./fns-client.js";
import type { EndpointTool } from "./types.js";

interface ServerState {
  activeVault?: string;
}

interface ToolContext {
  cfg: RuntimeConfig;
  client: FastNoteSyncClient;
  state: ServerState;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

type ToolResult = CallToolResult;

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function deepCopy(input: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(input));
}

function stringifyPayload(payload: unknown, prettyPrint: boolean): string {
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload, null, prettyPrint ? 2 : undefined);
}

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function asError(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

const endpointTools: EndpointTool[] = [
  {
    name: "fns_health",
    description: "Check server health",
    method: "GET",
    path: "/api/health",
    auth: "none",
    paramMode: "query",
  },
  {
    name: "fns_version",
    description: "Get fast-note-sync-service version",
    method: "GET",
    path: "/api/version",
    auth: "none",
    paramMode: "query",
  },
  {
    name: "fns_support",
    description: "Get support records",
    method: "GET",
    path: "/api/support",
    auth: "none",
    paramMode: "query",
  },
  {
    name: "fns_webgui_config",
    description: "Get web GUI public config",
    method: "GET",
    path: "/api/webgui/config",
    auth: "none",
    paramMode: "query",
  },

  {
    name: "fns_user_register",
    description: "Register new user",
    method: "POST",
    path: "/api/user/register",
    auth: "none",
    paramMode: "body",
  },
  {
    name: "fns_user_login",
    description: "Login and return token",
    method: "POST",
    path: "/api/user/login",
    auth: "none",
    paramMode: "form",
  },

  {
    name: "fns_share_get_note",
    description: "Get shared note by share token",
    method: "GET",
    path: "/api/share/note",
    auth: "share",
    paramMode: "query",
  },
  {
    name: "fns_share_get_file",
    description: "Get shared file content by share token (base64)",
    method: "GET",
    path: "/api/share/file",
    auth: "share",
    paramMode: "query",
    binaryResponse: true,
  },

  {
    name: "fns_share_create",
    description: "Create share token for note or file",
    method: "POST",
    path: "/api/share",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },

  {
    name: "fns_admin_get_config",
    description: "Get admin config",
    method: "GET",
    path: "/api/admin/config",
    auth: "user",
    paramMode: "query",
    dangerous: true,
  },
  {
    name: "fns_admin_update_config",
    description: "Update admin config",
    method: "POST",
    path: "/api/admin/config",
    auth: "user",
    paramMode: "body",
    dangerous: true,
  },
  {
    name: "fns_admin_get_ngrok_config",
    description: "Get ngrok config",
    method: "GET",
    path: "/api/admin/config/ngrok",
    auth: "user",
    paramMode: "query",
    dangerous: true,
  },
  {
    name: "fns_admin_update_ngrok_config",
    description: "Update ngrok config",
    method: "POST",
    path: "/api/admin/config/ngrok",
    auth: "user",
    paramMode: "body",
    dangerous: true,
  },
  {
    name: "fns_admin_get_cloudflare_config",
    description: "Get cloudflare config",
    method: "GET",
    path: "/api/admin/config/cloudflare",
    auth: "user",
    paramMode: "query",
    dangerous: true,
  },
  {
    name: "fns_admin_update_cloudflare_config",
    description: "Update cloudflare config",
    method: "POST",
    path: "/api/admin/config/cloudflare",
    auth: "user",
    paramMode: "body",
    dangerous: true,
  },
  {
    name: "fns_admin_get_system_info",
    description: "Get system info",
    method: "GET",
    path: "/api/admin/systeminfo",
    auth: "user",
    paramMode: "query",
    dangerous: true,
  },
  {
    name: "fns_admin_upgrade",
    description: "Run upgrade action",
    method: "GET",
    path: "/api/admin/upgrade",
    auth: "user",
    paramMode: "query",
    dangerous: true,
  },
  {
    name: "fns_admin_restart",
    description: "Restart server process",
    method: "GET",
    path: "/api/admin/restart",
    auth: "user",
    paramMode: "query",
    dangerous: true,
    confirm: { type: "boolean_true", field: "confirm" },
  },
  {
    name: "fns_admin_gc",
    description: "Trigger manual GC",
    method: "GET",
    path: "/api/admin/gc",
    auth: "user",
    paramMode: "query",
    dangerous: true,
    confirm: { type: "boolean_true", field: "confirm" },
  },
  {
    name: "fns_admin_download_cloudflared",
    description: "Download cloudflared binary (base64)",
    method: "GET",
    path: "/api/admin/cloudflared_tunnel_download",
    auth: "user",
    paramMode: "query",
    binaryResponse: true,
    dangerous: true,
  },

  {
    name: "fns_user_change_password",
    description: "Change current user password",
    method: "POST",
    path: "/api/user/change_password",
    auth: "user",
    paramMode: "body",
  },
  {
    name: "fns_user_info",
    description: "Get current user info",
    method: "GET",
    path: "/api/user/info",
    auth: "user",
    paramMode: "query",
  },

  {
    name: "fns_vault_upsert",
    description: "Create or update vault",
    method: "POST",
    path: "/api/vault",
    auth: "user",
    paramMode: "body",
  },
  {
    name: "fns_vault_delete",
    description: "Delete vault by id",
    method: "DELETE",
    path: "/api/vault",
    auth: "user",
    paramMode: "query",
    confirm: { type: "equals_field", field: "confirmId", expectedField: "id" },
  },

  {
    name: "fns_note_list",
    description: "List notes",
    method: "GET",
    path: "/api/notes",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_note_get",
    description: "Get single note",
    method: "GET",
    path: "/api/note",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_note_upsert",
    description: "Create or update note",
    method: "POST",
    path: "/api/note",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },
  {
    name: "fns_note_delete",
    description: "Delete note (soft delete)",
    method: "DELETE",
    path: "/api/note",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
    confirm: { type: "equals_field", field: "confirmPath", expectedField: "path" },
  },
  {
    name: "fns_note_restore",
    description: "Restore note from recycle bin",
    method: "PUT",
    path: "/api/note/restore",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },
  {
    name: "fns_note_recycle_clear",
    description: "Clear note recycle bin",
    method: "DELETE",
    path: "/api/note/recycle-clear",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
    confirm: { type: "boolean_true", field: "confirm" },
  },
  {
    name: "fns_note_patch_frontmatter",
    description: "Patch note frontmatter",
    method: "PATCH",
    path: "/api/note/frontmatter",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },
  {
    name: "fns_note_append",
    description: "Append content to note",
    method: "POST",
    path: "/api/note/append",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },
  {
    name: "fns_note_prepend",
    description: "Prepend content to note",
    method: "POST",
    path: "/api/note/prepend",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },
  {
    name: "fns_note_replace",
    description: "Find and replace content in note",
    method: "POST",
    path: "/api/note/replace",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },
  {
    name: "fns_note_move",
    description: "Move note to new path",
    method: "POST",
    path: "/api/note/move",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },
  {
    name: "fns_note_backlinks",
    description: "Get backlinks for note",
    method: "GET",
    path: "/api/note/backlinks",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_note_outlinks",
    description: "Get outlinks for note",
    method: "GET",
    path: "/api/note/outlinks",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },

  {
    name: "fns_note_history_list",
    description: "List note histories",
    method: "GET",
    path: "/api/note/histories",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_note_history_get",
    description: "Get note history detail",
    method: "GET",
    path: "/api/note/history",
    auth: "user",
    paramMode: "query",
  },
  {
    name: "fns_note_history_restore",
    description: "Restore note from history",
    method: "PUT",
    path: "/api/note/history/restore",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },

  {
    name: "fns_folder_get",
    description: "Get folder info",
    method: "GET",
    path: "/api/folder",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_folder_list",
    description: "List child folders",
    method: "GET",
    path: "/api/folders",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_folder_create",
    description: "Create folder",
    method: "POST",
    path: "/api/folder",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },
  {
    name: "fns_folder_delete",
    description: "Delete folder",
    method: "DELETE",
    path: "/api/folder",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
    confirm: { type: "equals_field", field: "confirmPath", expectedField: "path" },
  },
  {
    name: "fns_folder_tree",
    description: "Get folder tree",
    method: "GET",
    path: "/api/folder/tree",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_folder_notes",
    description: "List notes in folder",
    method: "GET",
    path: "/api/folder/notes",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_folder_files",
    description: "List files in folder",
    method: "GET",
    path: "/api/folder/files",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },

  {
    name: "fns_file_read_content",
    description: "Read file binary content (base64)",
    method: "GET",
    path: "/api/file",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
    binaryResponse: true,
  },
  {
    name: "fns_file_info",
    description: "Get file metadata",
    method: "GET",
    path: "/api/file/info",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_file_list",
    description: "List files",
    method: "GET",
    path: "/api/files",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
  },
  {
    name: "fns_file_delete",
    description: "Delete file (soft delete)",
    method: "DELETE",
    path: "/api/file",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
    confirm: { type: "equals_field", field: "confirmPath", expectedField: "path" },
  },
  {
    name: "fns_file_restore",
    description: "Restore file from recycle bin",
    method: "PUT",
    path: "/api/file/restore",
    auth: "user",
    paramMode: "body",
    requiresVault: true,
  },
  {
    name: "fns_file_recycle_clear",
    description: "Clear file recycle bin",
    method: "DELETE",
    path: "/api/file/recycle-clear",
    auth: "user",
    paramMode: "query",
    requiresVault: true,
    confirm: { type: "boolean_true", field: "confirm" },
  },

  {
    name: "fns_storage_list",
    description: "List storage configs",
    method: "GET",
    path: "/api/storage",
    auth: "user",
    paramMode: "query",
  },
  {
    name: "fns_storage_upsert",
    description: "Create or update storage config",
    method: "POST",
    path: "/api/storage",
    auth: "user",
    paramMode: "body",
  },
  {
    name: "fns_storage_enabled_types",
    description: "Get enabled storage types",
    method: "GET",
    path: "/api/storage/enabled_types",
    auth: "user",
    paramMode: "query",
  },
  {
    name: "fns_storage_validate",
    description: "Validate storage config",
    method: "POST",
    path: "/api/storage/validate",
    auth: "user",
    paramMode: "body",
  },
  {
    name: "fns_storage_delete",
    description: "Delete storage config",
    method: "DELETE",
    path: "/api/storage",
    auth: "user",
    paramMode: "query",
    confirm: { type: "boolean_true", field: "confirm" },
  },

  {
    name: "fns_backup_get_configs",
    description: "Get backup configs",
    method: "GET",
    path: "/api/backup/configs",
    auth: "user",
    paramMode: "query",
  },
  {
    name: "fns_backup_update_config",
    description: "Create or update backup config",
    method: "POST",
    path: "/api/backup/config",
    auth: "user",
    paramMode: "body",
  },
  {
    name: "fns_backup_delete_config",
    description: "Delete backup config",
    method: "DELETE",
    path: "/api/backup/config",
    auth: "user",
    paramMode: "query",
    confirm: { type: "boolean_true", field: "confirm" },
  },
  {
    name: "fns_backup_list_histories",
    description: "List backup histories",
    method: "GET",
    path: "/api/backup/historys",
    auth: "user",
    paramMode: "query",
  },
  {
    name: "fns_backup_execute",
    description: "Execute backup now",
    method: "POST",
    path: "/api/backup/execute",
    auth: "user",
    paramMode: "body",
    dangerous: true,
    confirm: { type: "boolean_true", field: "confirm" },
  },

  {
    name: "fns_git_sync_get_configs",
    description: "Get git-sync configs",
    method: "GET",
    path: "/api/git-sync/configs",
    auth: "user",
    paramMode: "query",
  },
  {
    name: "fns_git_sync_update_config",
    description: "Create or update git-sync config",
    method: "POST",
    path: "/api/git-sync/config",
    auth: "user",
    paramMode: "body",
  },
  {
    name: "fns_git_sync_delete_config",
    description: "Delete git-sync config",
    method: "DELETE",
    path: "/api/git-sync/config",
    auth: "user",
    paramMode: "query",
    confirm: { type: "boolean_true", field: "confirm" },
  },
  {
    name: "fns_git_sync_validate",
    description: "Validate git-sync config",
    method: "POST",
    path: "/api/git-sync/validate",
    auth: "user",
    paramMode: "body",
  },
  {
    name: "fns_git_sync_clean_workspace",
    description: "Clean git-sync workspace",
    method: "DELETE",
    path: "/api/git-sync/config/clean",
    auth: "user",
    paramMode: "query",
    dangerous: true,
    confirm: { type: "boolean_true", field: "confirm" },
  },
  {
    name: "fns_git_sync_execute",
    description: "Execute git-sync now",
    method: "POST",
    path: "/api/git-sync/config/execute",
    auth: "user",
    paramMode: "body",
    dangerous: true,
    confirm: { type: "boolean_true", field: "confirm" },
  },
  {
    name: "fns_git_sync_list_histories",
    description: "List git-sync histories",
    method: "GET",
    path: "/api/git-sync/histories",
    auth: "user",
    paramMode: "query",
  },
];

const endpointToolMap = new Map<string, EndpointTool>(
  endpointTools.map((tool) => [tool.name, tool]),
);

function buildEndpointInputSchema(tool: EndpointTool): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    prettyPrint: {
      type: "boolean",
      description: "Pretty JSON output (default from FNS_PRETTY_DEFAULT)",
      default: false,
    },
  };

  if (tool.requiresVault) {
    properties.vault = {
      type: "string",
      description: "Vault name. If omitted, active/default vault is used.",
    };
  }

  if (tool.binaryResponse) {
    properties.maxBytes = {
      type: "number",
      description: "Maximum bytes to read from response body before truncation (default 262144)",
      default: 262144,
    };
  }

  if (tool.confirm?.type === "boolean_true") {
    properties[tool.confirm.field] = {
      type: "boolean",
      description: `Safety confirmation. Set ${tool.confirm.field}=true to run this tool.`,
    };
  } else if (tool.confirm?.type === "equals_field") {
    properties[tool.confirm.field] = {
      type: "string",
      description: `Safety confirmation. Must exactly match field '${tool.confirm.expectedField}'.`,
    };
  } else if (tool.confirm?.type === "equals_value") {
    properties[tool.confirm.field] = {
      type: "string",
      description: `Safety confirmation. Must be exactly '${tool.confirm.expectedValue}'.`,
    };
  }

  return {
    type: "object",
    properties,
    additionalProperties: true,
  };
}

function getVaultFromArgs(
  args: Record<string, unknown>,
  ctx: ToolContext,
  required: boolean,
): string | undefined {
  const explicit = normalizeVault(args.vault);
  const fallback = ctx.state.activeVault ?? ctx.cfg.defaultVault;
  const selected = explicit ?? fallback;

  if (required && !selected) {
    throw new Error(
      "Vault is required for this tool. Provide 'vault' or set active vault via fns_vault_set_active.",
    );
  }

  if (!selected) {
    return undefined;
  }

  if (!isVaultAllowed(ctx.cfg, selected)) {
    throw new Error(`Vault '${selected}' is not allowed by FNS_ALLOWED_VAULTS.`);
  }

  return selected;
}

function enforceConfirmation(args: Record<string, unknown>, tool: EndpointTool): void {
  if (!tool.confirm) {
    return;
  }

  const confirm = tool.confirm;

  if (confirm.type === "boolean_true") {
    const passed = toBoolean(args[confirm.field], false);
    if (!passed) {
      throw new Error(`Safety check failed. Set '${confirm.field}=true' to execute ${tool.name}.`);
    }
    return;
  }

  if (confirm.type === "equals_field") {
    const current = args[confirm.field];
    const expected = args[confirm.expectedField];
    if (current == null || expected == null || String(current) !== String(expected)) {
      throw new Error(
        `Safety check failed. '${confirm.field}' must match '${confirm.expectedField}' exactly for ${tool.name}.`,
      );
    }
    return;
  }

  const current = args[confirm.field];
  if (current == null || String(current) !== confirm.expectedValue) {
    throw new Error(
      `Safety check failed. '${confirm.field}' must be '${confirm.expectedValue}' for ${tool.name}.`,
    );
  }
}

function normalizeInputForEndpoint(
  originalInput: Record<string, unknown>,
  tool: EndpointTool,
  ctx: ToolContext,
): {
  prettyPrint: boolean;
  maxBytes: number;
  payload: Record<string, unknown>;
} {
  const payload = deepCopy(originalInput);
  const prettyPrint = toBoolean(payload.prettyPrint, ctx.cfg.prettyDefault);
  const maxBytes = Math.max(1024, Math.floor(toNumber(payload.maxBytes, 262144)));

  payload.prettyPrint = undefined;
  payload.maxBytes = undefined;

  enforceConfirmation(payload, tool);

  const vault = getVaultFromArgs(payload, ctx, Boolean(tool.requiresVault));
  if (vault) {
    payload.vault = vault;
  }

  return { prettyPrint, maxBytes, payload };
}

async function runEndpointTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = endpointToolMap.get(name);
  if (!tool) {
    throw new Error(`Unknown endpoint tool: ${name}`);
  }

  if (tool.dangerous && !ctx.cfg.enableAdminTools && name.startsWith("fns_admin_")) {
    return asError("Admin tools are disabled. Set FNS_ENABLE_ADMIN_TOOLS=true to use them.");
  }

  const rawArgs = toInputRecord(input);
  const { prettyPrint, maxBytes, payload } = normalizeInputForEndpoint(rawArgs, tool, ctx);

  let query: Record<string, unknown> | undefined;
  let body: Record<string, unknown> | undefined;
  let form: Record<string, unknown> | undefined;

  if (tool.paramMode === "query") {
    query = payload;
  } else if (tool.paramMode === "body") {
    body = payload;
  } else if (tool.paramMode === "form") {
    form = payload;
  }

  if (tool.binaryResponse) {
    const result = await ctx.client.requestBinary(
      tool.path,
      { auth: tool.auth, query, body, form },
      maxBytes,
    );
    const output = {
      tool: tool.name,
      status: result.status,
      headers: result.headers,
      bytes: result.bytes,
      truncated: result.truncated,
      base64: result.base64,
    };
    const isError = result.status >= 400;
    return {
      content: [{ type: "text", text: stringifyPayload(output, prettyPrint) }],
      isError,
    };
  }

  const result = await ctx.client.requestJson(tool.method, tool.path, {
    auth: tool.auth,
    query,
    body,
    form,
  });
  return {
    content: [{ type: "text", text: stringifyPayload(result.payload, prettyPrint) }],
    isError: !result.ok,
  };
}

async function runCustomTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult | null> {
  const args = toInputRecord(input);
  const prettyPrint = toBoolean(args.prettyPrint, ctx.cfg.prettyDefault);

  switch (name) {
    case "fns_server_config": {
      const output = {
        baseUrl: ctx.cfg.baseUrl,
        allowAllVaults: ctx.cfg.allowAllVaults,
        allowedVaults: ctx.cfg.allowAllVaults ? "*" : Array.from(ctx.cfg.allowedVaults),
        defaultVault: ctx.cfg.defaultVault ?? null,
        activeVault: ctx.state.activeVault ?? null,
        adminToolsEnabled: ctx.cfg.enableAdminTools,
        authMode: {
          token: Boolean(ctx.cfg.token),
          credentials: Boolean(ctx.cfg.credentials && ctx.cfg.password),
          shareToken: Boolean(ctx.cfg.shareToken),
        },
      };
      return ok(stringifyPayload(output, prettyPrint));
    }

    case "fns_auth_set_token": {
      const token = typeof args.token === "string" ? args.token.trim() : "";
      if (!token) {
        return asError("token is required");
      }
      ctx.client.updateToken(token);
      return ok("Token updated for current MCP process.");
    }

    case "fns_auth_clear_token": {
      ctx.client.clearToken();
      return ok("Cached token cleared. Next user-auth call will use env login settings.");
    }

    case "fns_vault_get_active": {
      const output = {
        activeVault: ctx.state.activeVault ?? null,
        defaultVault: ctx.cfg.defaultVault ?? null,
        allowAllVaults: ctx.cfg.allowAllVaults,
        allowedVaults: ctx.cfg.allowAllVaults ? "*" : Array.from(ctx.cfg.allowedVaults),
      };
      return ok(stringifyPayload(output, prettyPrint));
    }

    case "fns_vault_set_active": {
      const vault = normalizeVault(args.vault);
      if (!vault) {
        return asError("vault is required");
      }
      if (!isVaultAllowed(ctx.cfg, vault)) {
        return asError(`Vault '${vault}' is not allowed by FNS_ALLOWED_VAULTS.`);
      }
      ctx.state.activeVault = vault;
      return ok(`Active vault set to '${vault}'.`);
    }

    case "fns_vault_list": {
      const result = await ctx.client.requestJson("GET", "/api/vault", {
        auth: "user",
        query: {},
      });

      let payload = result.payload;
      if (
        payload &&
        typeof payload === "object" &&
        !ctx.cfg.allowAllVaults &&
        Array.isArray((payload as Record<string, unknown>).data)
      ) {
        const container = payload as Record<string, unknown>;
        const data = container.data as Array<Record<string, unknown>>;
        container.data = data.filter((item) => {
          const name = typeof item.vault === "string" ? item.vault : undefined;
          return name ? ctx.cfg.allowedVaults.has(name) : false;
        });
        payload = container;
      }

      return {
        content: [{ type: "text", text: stringifyPayload(payload, prettyPrint) }],
        isError: !result.ok,
      };
    }

    case "fns_api_request": {
      const method = String(args.method ?? "GET").toUpperCase();
      const path = String(args.path ?? "").trim();
      const auth = String(args.auth ?? "user") as "none" | "user" | "share";
      const query = toInputRecord(args.query);
      const body = toInputRecord(args.body);
      const form = toInputRecord(args.form);
      const binary = toBoolean(args.binary, false);
      const maxBytes = Math.max(1024, Math.floor(toNumber(args.maxBytes, 262144)));

      if (!path.startsWith("/api/")) {
        return asError("path must start with '/api/'");
      }

      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        return asError("method must be one of GET, POST, PUT, PATCH, DELETE");
      }

      if (!["none", "user", "share"].includes(auth)) {
        return asError("auth must be one of none, user, share");
      }

      if (binary) {
        const bin = await ctx.client.requestBinary(path, { auth, query }, maxBytes);
        return {
          content: [
            {
              type: "text",
              text: stringifyPayload(
                {
                  status: bin.status,
                  headers: bin.headers,
                  bytes: bin.bytes,
                  truncated: bin.truncated,
                  base64: bin.base64,
                },
                prettyPrint,
              ),
            },
          ],
          isError: bin.status >= 400,
        };
      }

      const useForm = Object.keys(form).length > 0;
      const result = await ctx.client.requestJson(
        method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        path,
        {
          auth,
          query,
          body: useForm ? undefined : body,
          form: useForm ? form : undefined,
        },
      );

      return {
        content: [{ type: "text", text: stringifyPayload(result.payload, prettyPrint) }],
        isError: !result.ok,
      };
    }

    default:
      return null;
  }
}

function baseCustomTools(): McpTool[] {
  return [
    {
      name: "fns_server_config",
      description: "Show MCP runtime config (base URL, vault policy, active vault, auth mode)",
      inputSchema: {
        type: "object",
        properties: {
          prettyPrint: { type: "boolean", default: false },
        },
      },
    },
    {
      name: "fns_auth_set_token",
      description: "Set/replace user auth token at runtime",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Fast Note Sync user token" },
        },
        required: ["token"],
      },
    },
    {
      name: "fns_auth_clear_token",
      description: "Clear cached user auth token",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "fns_vault_list",
      description: "List vaults (filtered by FNS_ALLOWED_VAULTS when restricted)",
      inputSchema: {
        type: "object",
        properties: {
          prettyPrint: { type: "boolean", default: false },
        },
      },
    },
    {
      name: "fns_vault_get_active",
      description: "Get active/default vault and current vault policy",
      inputSchema: {
        type: "object",
        properties: {
          prettyPrint: { type: "boolean", default: false },
        },
      },
    },
    {
      name: "fns_vault_set_active",
      description: "Set active vault for tools that require vault but omit 'vault' arg",
      inputSchema: {
        type: "object",
        properties: {
          vault: { type: "string", description: "Vault name" },
        },
        required: ["vault"],
      },
    },
    {
      name: "fns_api_request",
      description:
        "Raw API passthrough for unsupported cases. Provide method/path/query/body/form/auth. Path must start with /api/.",
      inputSchema: {
        type: "object",
        properties: {
          method: { type: "string", default: "GET" },
          path: { type: "string", description: "API path, e.g. /api/version" },
          auth: { type: "string", enum: ["none", "user", "share"], default: "user" },
          query: { type: "object", description: "Query params object" },
          body: { type: "object", description: "JSON body object" },
          form: {
            type: "object",
            description: "Form body object (application/x-www-form-urlencoded)",
          },
          binary: { type: "boolean", default: false },
          maxBytes: { type: "number", default: 262144 },
          prettyPrint: { type: "boolean", default: false },
        },
        required: ["method", "path"],
      },
    },
  ];
}

export function getTools(cfg: RuntimeConfig): McpTool[] {
  const tools: McpTool[] = [...baseCustomTools()];

  for (const tool of endpointTools) {
    if (tool.name.startsWith("fns_admin_") && !cfg.enableAdminTools) {
      continue;
    }
    tools.push({
      name: tool.name,
      description: tool.description,
      inputSchema: buildEndpointInputSchema(tool),
    });
  }

  return tools;
}

export async function callTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const customResult = await runCustomTool(name, input, ctx);
    if (customResult) {
      return customResult;
    }

    if (endpointToolMap.has(name)) {
      return await runEndpointTool(name, input, ctx);
    }

    return asError(`Unknown tool: ${name}`);
  } catch (error) {
    return asError(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export type { ServerState, ToolContext, McpTool, ToolResult };
