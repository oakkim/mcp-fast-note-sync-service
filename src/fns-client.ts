import { type AuthMode, type RuntimeConfig, authHints } from "./config.js";
import type { ApiEnvelope, BinaryResult, HttpMethod, RequestOptions } from "./types.js";

function toRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { ...(input as Record<string, unknown>) };
  }
  return {};
}

function appendSearchParams(url: URL, params: Record<string, unknown> | undefined): void {
  if (!params) {
    return;
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }

    if (typeof value === "object") {
      url.searchParams.set(key, JSON.stringify(value));
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

function toFormBody(form: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          body.append(key, String(item));
        }
      }
      continue;
    }
    if (typeof value === "object") {
      body.set(key, JSON.stringify(value));
      continue;
    }
    body.set(key, String(value));
  }
  return body;
}

function pickHeader(headers: Headers, key: string): string | undefined {
  const value = headers.get(key);
  return value ?? undefined;
}

async function readStreamUpTo(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) {
    return { bytes: new Uint8Array(), truncated: false };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      if (received + value.length > maxBytes) {
        const remain = maxBytes - received;
        if (remain > 0) {
          chunks.push(value.subarray(0, remain));
          received += remain;
        }
        truncated = true;
        await reader.cancel();
        break;
      }

      chunks.push(value);
      received += value.length;

      if (received >= maxBytes) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return { bytes: merged, truncated };
}

export class FastNoteSyncClient {
  private token?: string;

  constructor(private readonly cfg: RuntimeConfig) {
    this.token = cfg.token;
  }

  private async ensureUserToken(): Promise<string> {
    if (this.token) {
      return this.token;
    }

    const credentials = this.cfg.credentials;
    const password = this.cfg.password;
    if (!credentials || !password) {
      throw new Error(
        `User auth token is missing. Provide FNS_TOKEN or login env (FNS_CREDENTIALS/FNS_PASSWORD). Current auth source: ${authHints(this.cfg)}`,
      );
    }

    const url = new URL("/api/user/login", this.cfg.baseUrl);
    const form = new URLSearchParams({ credentials, password });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    const payload = (await response.json()) as ApiEnvelope<{ token?: string }>;
    if (!response.ok || !payload?.status || !payload?.data?.token) {
      throw new Error(`Login failed: ${payload?.message ?? response.statusText}`);
    }

    this.token = payload.data.token;
    return this.token;
  }

  private async buildHeaders(
    auth: AuthMode,
    extraHeaders?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(extraHeaders ?? {}),
    };

    if (auth === "user") {
      const token = await this.ensureUserToken();
      headers.Authorization = `Bearer ${token}`;
      return headers;
    }

    if (auth === "share") {
      if (!this.cfg.shareToken) {
        throw new Error("Share token is missing. Set FNS_SHARE_TOKEN to use share tools.");
      }
      headers["Share-Token"] = this.cfg.shareToken;
    }

    return headers;
  }

  async requestJson(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
  ): Promise<{ payload: unknown; statusCode: number; ok: boolean }> {
    const url = new URL(path, this.cfg.baseUrl);
    appendSearchParams(url, options.query);

    const headers = await this.buildHeaders(options.auth, options.headers);
    const init: RequestInit = {
      method,
      headers,
    };

    if (options.form) {
      const formBody = toFormBody(options.form);
      init.headers = {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      };
      init.body = formBody.toString();
    } else if (options.body && method !== "GET" && method !== "DELETE") {
      init.headers = {
        ...headers,
        "Content-Type": "application/json",
      };
      init.body = JSON.stringify(options.body);
    } else if (options.body && method === "DELETE") {
      init.headers = {
        ...headers,
        "Content-Type": "application/json",
      };
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, init);
    const text = await response.text();

    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = text;
    }

    let ok = response.ok;
    if (payload && typeof payload === "object") {
      const envelope = payload as ApiEnvelope;
      if (typeof envelope.status === "boolean") {
        ok = ok && envelope.status;
      }
    }

    return { payload, statusCode: response.status, ok };
  }

  async requestBinary(
    path: string,
    options: RequestOptions,
    maxBytes: number,
  ): Promise<BinaryResult> {
    const url = new URL(path, this.cfg.baseUrl);
    appendSearchParams(url, options.query);

    const headers = await this.buildHeaders(options.auth, options.headers);
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    const { bytes, truncated } = await readStreamUpTo(response.body, maxBytes);

    const serializedHeaders: Record<string, string> = {};
    for (const [key, value] of response.headers.entries()) {
      serializedHeaders[key] = value;
    }

    return {
      status: response.status,
      headers: serializedHeaders,
      bytes: bytes.byteLength,
      truncated,
      base64: Buffer.from(bytes).toString("base64"),
    };
  }

  clearToken(): void {
    this.token = undefined;
  }

  updateToken(token: string): void {
    this.token = token.trim();
  }
}

export function toInputRecord(input: unknown): Record<string, unknown> {
  return toRecord(input);
}
