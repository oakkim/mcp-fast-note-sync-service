import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../src/config.js";
import { FastNoteSyncClient } from "../src/fns-client.js";

function makeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    baseUrl: "http://localhost:9000",
    allowAllVaults: true,
    allowedVaults: new Set<string>(),
    enableAdminTools: false,
    prettyDefault: false,
    token: undefined,
    credentials: undefined,
    password: undefined,
    shareToken: undefined,
    defaultVault: undefined,
    activeVault: undefined,
    ...overrides,
  };
}

describe("FastNoteSyncClient", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends Bearer token for user-auth JSON requests", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: true, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = new FastNoteSyncClient(makeConfig({ token: "test-token" }));

    const result = await client.requestJson("GET", "/api/version", {
      auth: "user",
      query: { trace: "abc" },
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain("/api/version?trace=abc");
    expect(init.method).toBe("GET");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
  });

  it("logs in once when token is absent and credentials are provided", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: true, data: { token: "issued-token" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: true, data: { user: "ok" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: true, data: { info: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const client = new FastNoteSyncClient(
      makeConfig({
        credentials: "user@example.com",
        password: "secret",
      }),
    );

    await client.requestJson("GET", "/api/vault", { auth: "user", query: {} });
    await client.requestJson("GET", "/api/user/info", { auth: "user", query: {} });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [loginUrl, loginInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(loginUrl)).toContain("/api/user/login");
    expect(loginInit.method).toBe("POST");
    expect(String(loginInit.body)).toBe("credentials=user%40example.com&password=secret");

    const [, firstApiInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    const headers = firstApiInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer issued-token");
  });

  it("reads binary responses with max-byte truncation", async () => {
    const data = Uint8Array.from({ length: 32 }, (_, index) => index);
    fetchMock.mockResolvedValueOnce(
      new Response(data, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );

    const client = new FastNoteSyncClient(makeConfig());
    const result = await client.requestBinary(
      "/api/file",
      {
        auth: "none",
        query: { path: "a.bin" },
      },
      10,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(result.bytes).toBe(10);
    expect(result.truncated).toBe(true);
    expect(Buffer.from(result.base64, "base64").length).toBe(10);
  });
});
