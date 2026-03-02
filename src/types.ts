import type { AuthMode } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ParamMode = "query" | "body" | "form" | "none";

export interface EndpointTool {
  name: string;
  description: string;
  method: HttpMethod;
  path: string;
  auth: AuthMode;
  paramMode: ParamMode;
  requiresVault?: boolean;
  binaryResponse?: boolean;
  dangerous?: boolean;
  confirm?:
    | { type: "equals_field"; field: string; expectedField: string }
    | { type: "equals_value"; field: string; expectedValue: string }
    | { type: "boolean_true"; field: string };
}

export interface ApiEnvelope<T = unknown> {
  code?: number;
  status?: boolean;
  message?: string;
  data?: T;
  details?: unknown;
  vault?: unknown;
  context?: unknown;
}

export interface RequestOptions {
  auth: AuthMode;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  form?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface BinaryResult {
  status: number;
  headers: Record<string, string>;
  bytes: number;
  truncated: boolean;
  base64: string;
}
