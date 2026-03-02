import { describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../src/config.js";
import { FastNoteSyncClient } from "../src/fns-client.js";
import { type ServerState, type ToolContext, callTool, getTools } from "../src/tools.js";

function makeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    baseUrl: "http://localhost:9000",
    allowAllVaults: true,
    allowedVaults: new Set<string>(),
    enableAdminTools: false,
    prettyDefault: false,
    token: "fixed-token",
    credentials: undefined,
    password: undefined,
    shareToken: undefined,
    defaultVault: undefined,
    activeVault: undefined,
    ...overrides,
  };
}

function makeContext(cfg: RuntimeConfig): ToolContext {
  const client = new FastNoteSyncClient(cfg);
  const state: ServerState = { activeVault: cfg.activeVault };
  return { cfg, client, state };
}

function extractText(result: Awaited<ReturnType<typeof callTool>>): string {
  return result.content[0]?.text ?? "";
}

describe("getTools", () => {
  it("hides admin tools by default and exposes them when enabled", () => {
    const hidden = getTools(makeConfig({ enableAdminTools: false }));
    expect(hidden.some((tool) => tool.name.startsWith("fns_admin_"))).toBe(false);

    const shown = getTools(makeConfig({ enableAdminTools: true }));
    expect(shown.some((tool) => tool.name.startsWith("fns_admin_"))).toBe(true);
  });
});

describe("callTool", () => {
  it("sets active vault and injects it into vault-required endpoint tools", async () => {
    const cfg = makeConfig({
      allowAllVaults: false,
      allowedVaults: new Set(["Team"]),
    });
    const ctx = makeContext(cfg);

    const requestJsonSpy = vi
      .spyOn(ctx.client, "requestJson")
      .mockResolvedValue({ payload: { status: true }, statusCode: 200, ok: true });

    const setResult = await callTool("fns_vault_set_active", { vault: "Team" }, ctx);
    expect(setResult.isError).toBeUndefined();

    const getResult = await callTool("fns_note_get", { path: "README.md" }, ctx);
    expect(getResult.isError).toBe(false);
    expect(requestJsonSpy).toHaveBeenCalledTimes(1);

    const [, , options] = requestJsonSpy.mock.calls[0] as [
      string,
      string,
      { query?: Record<string, unknown> },
    ];

    expect(options.query?.vault).toBe("Team");
    expect(options.query?.path).toBe("README.md");
  });

  it("rejects disallowed vault selection", async () => {
    const cfg = makeConfig({
      allowAllVaults: false,
      allowedVaults: new Set(["Allowed"]),
    });
    const ctx = makeContext(cfg);

    const result = await callTool("fns_vault_set_active", { vault: "Blocked" }, ctx);
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("not allowed");
  });

  it("enforces confirm checks for dangerous delete-style tools", async () => {
    const cfg = makeConfig({ defaultVault: "MainVault" });
    const ctx = makeContext(cfg);

    const requestJsonSpy = vi
      .spyOn(ctx.client, "requestJson")
      .mockResolvedValue({ payload: { status: true }, statusCode: 200, ok: true });

    const denied = await callTool(
      "fns_note_delete",
      { path: "note.md", confirmPath: "other.md" },
      ctx,
    );
    expect(denied.isError).toBe(true);
    expect(requestJsonSpy).not.toHaveBeenCalled();

    const allowed = await callTool(
      "fns_note_delete",
      { path: "note.md", confirmPath: "note.md" },
      ctx,
    );
    expect(allowed.isError).toBe(false);
    expect(requestJsonSpy).toHaveBeenCalledTimes(1);

    const [, , options] = requestJsonSpy.mock.calls[0] as [
      string,
      string,
      { query?: Record<string, unknown> },
    ];

    expect(options.query?.vault).toBe("MainVault");
  });

  it("filters vault list when policy is restricted", async () => {
    const cfg = makeConfig({
      allowAllVaults: false,
      allowedVaults: new Set(["KeepMe"]),
    });
    const ctx = makeContext(cfg);

    vi.spyOn(ctx.client, "requestJson").mockResolvedValue({
      payload: {
        status: true,
        data: [{ vault: "KeepMe" }, { vault: "DropMe" }],
      },
      statusCode: 200,
      ok: true,
    });

    const result = await callTool("fns_vault_list", {}, ctx);
    expect(result.isError).toBe(false);

    const parsed = JSON.parse(extractText(result)) as {
      data: Array<{ vault: string }>;
    };

    expect(parsed.data).toEqual([{ vault: "KeepMe" }]);
  });

  it("validates raw API passthrough path", async () => {
    const ctx = makeContext(makeConfig());
    const result = await callTool("fns_api_request", { method: "GET", path: "/version" }, ctx);

    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain("/api/");
  });
});
