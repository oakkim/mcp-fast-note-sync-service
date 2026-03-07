import { describe, expect, it } from "vitest";
import { parseCliArgs, parseVaultHeaders } from "../src/connection-overrides.js";

describe("parseCliArgs", () => {
  it("maps --vault to a single-vault scope", () => {
    const parsed = parseCliArgs(["--vault", "Team"]);

    expect(parsed.help).toBe(false);
    expect(parsed.configOverrides).toEqual({
      allowedVaults: "Team",
      defaultVault: "Team",
      activeVault: "Team",
    });
  });

  it("lets explicit flags override the --vault shorthand", () => {
    const parsed = parseCliArgs([
      "--vault",
      "Team",
      "--allowed-vaults",
      "Team,Personal",
      "--active-vault",
      "Personal",
    ]);

    expect(parsed.configOverrides).toEqual({
      allowedVaults: "Team,Personal",
      defaultVault: "Team",
      activeVault: "Personal",
    });
  });

  it("rejects active vaults outside the allowed scope", () => {
    expect(() => parseCliArgs(["--allowed-vaults", "Team", "--active-vault", "Blocked"])).toThrow(
      "--active-vault",
    );
  });
});

describe("parseVaultHeaders", () => {
  it("reads x-fns-vault as a single-vault scope", () => {
    const overrides = parseVaultHeaders({
      "x-fns-vault": "Team",
    });

    expect(overrides).toEqual({
      allowedVaults: "Team",
      defaultVault: "Team",
      activeVault: "Team",
    });
  });

  it("rejects header combinations outside the allowed scope", () => {
    expect(() =>
      parseVaultHeaders({
        "x-fns-allowed-vaults": "Team",
        "x-fns-default-vault": "Blocked",
      }),
    ).toThrow("x-fns-default-vault");
  });
});
