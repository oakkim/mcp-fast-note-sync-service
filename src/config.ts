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

export function loadConfig(): RuntimeConfig {
  const baseUrl = (process.env.FNS_BASE_URL ?? "http://fast-note-sync-service:9000").replace(
    /\/+$/,
    "",
  );
  const token = process.env.FNS_TOKEN?.trim() || undefined;
  const credentials = process.env.FNS_CREDENTIALS?.trim() || undefined;
  const password = process.env.FNS_PASSWORD?.trim() || undefined;
  const shareToken = process.env.FNS_SHARE_TOKEN?.trim() || undefined;
  const defaultVault = process.env.FNS_DEFAULT_VAULT?.trim() || undefined;
  const activeVault = process.env.FNS_ACTIVE_VAULT?.trim() || defaultVault;
  const parsedAllowed = parseAllowedVaults(process.env.FNS_ALLOWED_VAULTS);
  const enableAdminTools = parseBoolean(process.env.FNS_ENABLE_ADMIN_TOOLS, false);
  const prettyDefault = parseBoolean(process.env.FNS_PRETTY_DEFAULT, false);

  return {
    baseUrl,
    token,
    credentials,
    password,
    shareToken,
    defaultVault,
    activeVault,
    allowAllVaults: parsedAllowed.allowAllVaults,
    allowedVaults: parsedAllowed.allowedVaults,
    enableAdminTools,
    prettyDefault,
  };
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
