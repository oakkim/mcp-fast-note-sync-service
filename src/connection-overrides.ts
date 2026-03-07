import type { IncomingHttpHeaders } from "node:http";
import { parseArgs } from "node:util";
import type { RuntimeConfigOverrides } from "./config.js";

interface ParsedCliOptions {
  help: boolean;
  configOverrides: RuntimeConfigOverrides;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseAllowedVaultSet(input: string | undefined): Set<string> | null {
  const normalized = normalizeOptionalString(input);
  if (!normalized || normalized === "*") {
    return null;
  }

  const values = normalized
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return values.length > 0 ? new Set(values) : null;
}

function validateOverrides(
  overrides: RuntimeConfigOverrides,
  labels: { defaultVault: string; activeVault: string },
): void {
  const allowedVaults = parseAllowedVaultSet(overrides.allowedVaults);
  if (!allowedVaults) {
    return;
  }

  const checks: Array<[string, string | undefined]> = [
    [labels.defaultVault, overrides.defaultVault],
    [labels.activeVault, overrides.activeVault],
  ];

  for (const [flagName, vault] of checks) {
    const normalizedVault = normalizeOptionalString(vault);
    if (normalizedVault && !allowedVaults.has(normalizedVault)) {
      throw new Error(`${flagName} must be included in the allowed vault scope.`);
    }
  }
}

function getHeaderValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const rawValue = headers[name.toLowerCase()];
  if (Array.isArray(rawValue)) {
    return rawValue[0];
  }
  return rawValue;
}

export function parseCliArgs(argv: string[]): ParsedCliOptions {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      help: { type: "boolean", short: "h" },
      vault: { type: "string" },
      "allowed-vaults": { type: "string" },
      "default-vault": { type: "string" },
      "active-vault": { type: "string" },
    },
  });

  const scopedVault = typeof values.vault === "string" ? values.vault : undefined;
  const allowedVaults =
    typeof values["allowed-vaults"] === "string" ? values["allowed-vaults"] : undefined;
  const defaultVault =
    typeof values["default-vault"] === "string" ? values["default-vault"] : undefined;
  const activeVault =
    typeof values["active-vault"] === "string" ? values["active-vault"] : undefined;

  const configOverrides: RuntimeConfigOverrides = {
    allowedVaults: allowedVaults ?? scopedVault,
    defaultVault: defaultVault ?? scopedVault,
    activeVault: activeVault ?? scopedVault,
  };

  validateOverrides(configOverrides, {
    defaultVault: "--default-vault",
    activeVault: "--active-vault",
  });

  return {
    help: values.help === true,
    configOverrides,
  };
}

export function parseVaultHeaders(headers: IncomingHttpHeaders): RuntimeConfigOverrides {
  const scopedVault = getHeaderValue(headers, "x-fns-vault");

  const overrides: RuntimeConfigOverrides = {
    allowedVaults: getHeaderValue(headers, "x-fns-allowed-vaults") ?? scopedVault,
    defaultVault: getHeaderValue(headers, "x-fns-default-vault") ?? scopedVault,
    activeVault: getHeaderValue(headers, "x-fns-active-vault") ?? scopedVault,
  };

  validateOverrides(overrides, {
    defaultVault: "x-fns-default-vault",
    activeVault: "x-fns-active-vault",
  });
  return overrides;
}

export function getCliHelpText(): string {
  return [
    "Usage: mcp-fast-note-sync-service [options]",
    "",
    "Vault scoping options:",
    "  --vault <name>            Restrict the MCP connection to one vault and set it active.",
    "  --allowed-vaults <list>   Comma-separated allow list or '*'.",
    "  --default-vault <name>    Default vault fallback for tool calls.",
    "  --active-vault <name>     Initial active vault for the connection.",
    "  -h, --help                Show this help text.",
  ].join("\n");
}
