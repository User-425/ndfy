export interface AuthConfig {
  mode: 'none' | 'token';
  tokens: string[];
}

export class AuthService {
  private mode: 'none' | 'token';
  private validTokens: Set<string>;

  constructor(config: AuthConfig) {
    this.mode = config.mode;
    this.validTokens = new Set(config.tokens);
  }

  public isAuthorized(providedAuth?: string): boolean {
    if (this.mode === 'none') {
      return true;
    }

    if (!providedAuth) {
      return false;
    }

    const trimmed = providedAuth.trim();
    if (!trimmed) {
      return false;
    }

    // 1. Direct Bearer token: "Bearer <token>"
    if (/^Bearer\s+/i.test(trimmed)) {
      const token = trimmed.replace(/^Bearer\s+/i, '').trim();
      return this.validTokens.has(token);
    }

    // 2. HTTP Basic Auth: "Basic <base64>"
    if (/^Basic\s+/i.test(trimmed)) {
      const base64Str = trimmed.replace(/^Basic\s+/i, '').trim();
      return this.checkBase64(base64Str);
    }

    // 3. Exact match against valid tokens (plain token in ?auth= or header)
    if (this.validTokens.has(trimmed)) {
      return true;
    }

    // 4. Try base64 decoded match (e.g. ?auth=<base64> from ntfy web app / EventSource / WebSocket)
    return this.checkBase64(trimmed);
  }

  private checkBase64(encoded: string): boolean {
    try {
      const buffer = Buffer.from(encoded, 'base64');
      // Verify valid base64 (ignoring trailing padding differences)
      if (buffer.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
        return false;
      }

      const decoded = buffer.toString('utf-8');
      if (decoded.includes(':')) {
        const colonIndex = decoded.indexOf(':');
        const username = decoded.slice(0, colonIndex).trim();
        const password = decoded.slice(colonIndex + 1).trim();

        return this.validTokens.has(password) || this.validTokens.has(username);
      }

      return this.validTokens.has(decoded.trim());
    } catch {
      return false;
    }
  }

  public getMode(): string {
    return this.mode;
  }
}

