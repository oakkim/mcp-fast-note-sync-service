export type AuthMode = "none" | "user" | "share";

export interface RuntimeConfig {
  baseUrl: string;
  token?: string;
  credentials?: string;
  password?: string;
  shareToken?: string;
  defaultVault?: string;
  activeVault?: string;
  allowAllVaults: boolean;
  allowedVaults: Set<string>;
  enableAdminTools: boolean;
  prettyDefault: boolean;
}

export interface RuntimeConfigOverrides {
  allowedVaults?: string;
  defaultVault?: string;
  activeVault?: string;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === "") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function parseAllowedVaults(input: string | undefined): {
  allowAllVaults: boolean;
  allowedVaults: Set<string>;
} {
  if (!input || input.trim() === "" || input.trim() === "*") {
    return { allowAllVaults: true, allowedVaults: new Set<string>() };
  }

  const values = input
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  if (values.length === 0) {
    return { allowAllVaults: true, allowedVaults: new Set<string>() };
  }

  return { allowAllVaults: false, allowedVaults: new Set(values) };
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizeVaultSelection(
  defaultVault: string | undefined,
  activeVault: string | undefined,
  allowAllVaults: boolean,
  allowedVaults: Set<string>,
): {
  defaultVault?: string;
  activeVault?: string;
} {
  if (allowAllVaults) {
    return {
      defaultVault,
      activeVault: activeVault ?? defaultVault,
    };
  }

  const singleAllowedVault =
    allowedVaults.size === 1 ? allowedVaults.values().next().value : undefined;
  const nextDefault =
    defaultVault && allowedVaults.has(defaultVault) ? defaultVault : singleAllowedVault;
  const nextActiveBase = activeVault && allowedVaults.has(activeVault) ? activeVault : undefined;

  return {
    defaultVault: nextDefault,
    activeVault: nextActiveBase ?? nextDefault,
  };
}

function withVaultPolicy(
  cfg: RuntimeConfig,
  defaultVaultInput: string | undefined,
  activeVaultInput: string | undefined,
  allowedVaultsInput: string | undefined,
): RuntimeConfig {
  const parsedAllowed = parseAllowedVaults(allowedVaultsInput);
  const normalized = sanitizeVaultSelection(
    normalizeOptionalString(defaultVaultInput),
    normalizeOptionalString(activeVaultInput),
    parsedAllowed.allowAllVaults,
    parsedAllowed.allowedVaults,
  );

  return {
    ...cfg,
    defaultVault: normalized.defaultVault,
    activeVault: normalized.activeVault,
    allowAllVaults: parsedAllowed.allowAllVaults,
    allowedVaults: parsedAllowed.allowedVaults,
  };
}

export function loadConfig(overrides: RuntimeConfigOverrides = {}): RuntimeConfig {
  const baseUrl = (
    normalizeOptionalString(process.env.FNS_BASE_URL) ?? "http://fast-note-sync-service:9000"
  ).replace(/\/+$/, "");
  const token = normalizeOptionalString(process.env.FNS_TOKEN);
  const credentials = normalizeOptionalString(process.env.FNS_CREDENTIALS);
  const password = normalizeOptionalString(process.env.FNS_PASSWORD);
  const shareToken = normalizeOptionalString(process.env.FNS_SHARE_TOKEN);
  const enableAdminTools = parseBoolean(process.env.FNS_ENABLE_ADMIN_TOOLS, false);
  const prettyDefault = parseBoolean(process.env.FNS_PRETTY_DEFAULT, false);

  const cfg: RuntimeConfig = {
    baseUrl,
    token,
    credentials,
    password,
    shareToken,
    defaultVault: undefined,
    activeVault: undefined,
    allowAllVaults: true,
    allowedVaults: new Set<string>(),
    enableAdminTools,
    prettyDefault,
  };

  return withVaultPolicy(
    cfg,
    overrides.defaultVault ?? process.env.FNS_DEFAULT_VAULT,
    overrides.activeVault ?? process.env.FNS_ACTIVE_VAULT,
    overrides.allowedVaults ?? process.env.FNS_ALLOWED_VAULTS,
  );
}

export function applyConfigOverrides(
  baseCfg: RuntimeConfig,
  overrides: RuntimeConfigOverrides = {},
): RuntimeConfig {
  return withVaultPolicy(
    {
      ...baseCfg,
      allowedVaults: new Set(baseCfg.allowedVaults),
    },
    overrides.defaultVault ?? baseCfg.defaultVault,
    overrides.activeVault ?? baseCfg.activeVault,
    overrides.allowedVaults === undefined
      ? baseCfg.allowAllVaults
        ? "*"
        : Array.from(baseCfg.allowedVaults).join(",")
      : overrides.allowedVaults,
  );
}

export function isVaultAllowed(cfg: RuntimeConfig, vault: string): boolean {
  if (cfg.allowAllVaults) {
    return true;
  }
  return cfg.allowedVaults.has(vault);
}

export function normalizeVault(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function authHints(cfg: RuntimeConfig): string {
  if (cfg.token) {
    return "FNS_TOKEN";
  }
  if (cfg.credentials && cfg.password) {
    return "FNS_CREDENTIALS/FNS_PASSWORD";
  }
  return "(none)";
}
