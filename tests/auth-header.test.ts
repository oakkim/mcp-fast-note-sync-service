import { describe, expect, it, vi } from "vitest";
import { applyBearerToken, extractBearerToken } from "../src/auth-header.js";

describe("extractBearerToken", () => {
  it("extracts token from Bearer header", () => {
    expect(extractBearerToken("Bearer test-token")).toBe("test-token");
  });

  it("supports case-insensitive scheme and trims token", () => {
    expect(extractBearerToken("bearer    spaced-token   ")).toBe("spaced-token");
  });

  it("uses first value when header array is provided", () => {
    expect(extractBearerToken(["Bearer first", "Bearer second"])).toBe("first");
  });

  it("returns undefined for invalid or missing header", () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken("Basic abc123")).toBeUndefined();
    expect(extractBearerToken("Bearer   ")).toBeUndefined();
  });
});

describe("applyBearerToken", () => {
  it("updates client token and config token when Bearer header exists", () => {
    const updateToken = vi.fn();
    const cfg = { token: undefined as string | undefined };

    const applied = applyBearerToken("Bearer runtime-token", { updateToken }, cfg);

    expect(applied).toBe("runtime-token");
    expect(updateToken).toHaveBeenCalledTimes(1);
    expect(updateToken).toHaveBeenCalledWith("runtime-token");
    expect(cfg.token).toBe("runtime-token");
  });

  it("does nothing when header is not Bearer", () => {
    const updateToken = vi.fn();
    const cfg = { token: "env-token" };

    const applied = applyBearerToken("Basic something", { updateToken }, cfg);

    expect(applied).toBeUndefined();
    expect(updateToken).not.toHaveBeenCalled();
    expect(cfg.token).toBe("env-token");
  });
});
