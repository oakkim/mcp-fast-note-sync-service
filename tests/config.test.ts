import { afterEach, describe, expect, it, vi } from "vitest";
import { applyConfigOverrides, isVaultAllowed, loadConfig } from "../src/config.js";

const ENV_KEYS = [
  "FNS_BASE_URL",
  "FNS_TOKEN",
  "FNS_CREDENTIALS",
  "FNS_PASSWORD",
  "FNS_SHARE_TOKEN",
  "FNS_DEFAULT_VAULT",
  "FNS_ACTIVE_VAULT",
  "FNS_ALLOWED_VAULTS",
  "FNS_ENABLE_ADMIN_TOOLS",
  "FNS_PRETTY_DEFAULT",
] as const;

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadConfig", () => {
  it("loads defaults with allow-all vault policy", () => {
    clearEnv();
    const cfg = loadConfig();

    expect(cfg.baseUrl).toBe("http://fast-note-sync-service:9000");
    expect(cfg.allowAllVaults).toBe(true);
    expect(cfg.allowedVaults.size).toBe(0);
    expect(cfg.enableAdminTools).toBe(false);
    expect(cfg.prettyDefault).toBe(false);
  });

  it("parses explicit allowed vault list", () => {
    clearEnv();
    vi.stubEnv("FNS_ALLOWED_VAULTS", "Team, Personal");

    const cfg = loadConfig();

    expect(cfg.allowAllVaults).toBe(false);
    expect(cfg.allowedVaults.has("Team")).toBe(true);
    expect(cfg.allowedVaults.has("Personal")).toBe(true);
    expect(isVaultAllowed(cfg, "Team")).toBe(true);
    expect(isVaultAllowed(cfg, "Other")).toBe(false);
  });

  it("applies active vault fallback and boolean flags", () => {
    clearEnv();
    vi.stubEnv("FNS_DEFAULT_VAULT", "DefaultVault");
    vi.stubEnv("FNS_ENABLE_ADMIN_TOOLS", "true");
    vi.stubEnv("FNS_PRETTY_DEFAULT", "1");

    const cfg = loadConfig();

    expect(cfg.defaultVault).toBe("DefaultVault");
    expect(cfg.activeVault).toBe("DefaultVault");
    expect(cfg.enableAdminTools).toBe(true);
    expect(cfg.prettyDefault).toBe(true);
  });

  it("lets explicit overrides replace env vault policy", () => {
    clearEnv();
    vi.stubEnv("FNS_ALLOWED_VAULTS", "EnvVault");
    vi.stubEnv("FNS_DEFAULT_VAULT", "EnvVault");
    vi.stubEnv("FNS_ACTIVE_VAULT", "EnvVault");

    const cfg = loadConfig({
      allowedVaults: "CliVault",
      defaultVault: "CliVault",
      activeVault: "CliVault",
    });

    expect(cfg.allowAllVaults).toBe(false);
    expect(Array.from(cfg.allowedVaults)).toEqual(["CliVault"]);
    expect(cfg.defaultVault).toBe("CliVault");
    expect(cfg.activeVault).toBe("CliVault");
  });

  it("normalizes invalid env defaults to a single allowed vault", () => {
    clearEnv();
    vi.stubEnv("FNS_ALLOWED_VAULTS", "Team");
    vi.stubEnv("FNS_DEFAULT_VAULT", "Blocked");
    vi.stubEnv("FNS_ACTIVE_VAULT", "Blocked");

    const cfg = loadConfig();

    expect(cfg.defaultVault).toBe("Team");
    expect(cfg.activeVault).toBe("Team");
  });
});

describe("applyConfigOverrides", () => {
  it("re-scopes inherited defaults when the allowed vault list narrows", () => {
    const scoped = applyConfigOverrides(
      {
        baseUrl: "http://localhost:9000",
        token: undefined,
        credentials: undefined,
        password: undefined,
        shareToken: undefined,
        defaultVault: "General",
        activeVault: "General",
        allowAllVaults: true,
        allowedVaults: new Set<string>(),
        enableAdminTools: false,
        prettyDefault: false,
      },
      { allowedVaults: "ProjectA" },
    );

    expect(scoped.allowAllVaults).toBe(false);
    expect(Array.from(scoped.allowedVaults)).toEqual(["ProjectA"]);
    expect(scoped.defaultVault).toBe("ProjectA");
    expect(scoped.activeVault).toBe("ProjectA");
  });
});
