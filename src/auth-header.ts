export interface TokenClient {
  updateToken(token: string): void;
}

export interface TokenConfigTarget {
  token?: string;
}

export function extractBearerToken(
  authorizationHeader: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (!value) {
    return undefined;
  }

  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  const token = match[1].trim();
  return token || undefined;
}

export function applyBearerToken(
  authorizationHeader: string | string[] | undefined,
  client: TokenClient,
  cfg?: TokenConfigTarget,
): string | undefined {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return undefined;
  }

  client.updateToken(token);
  if (cfg) {
    cfg.token = token;
  }

  return token;
}
