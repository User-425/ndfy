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

  public isAuthorized(providedToken?: string): boolean {
    if (this.mode === 'none') {
      return true;
    }

    if (!providedToken) {
      return false;
    }

    const cleanToken = providedToken.replace(/^Bearer\s+/i, '').trim();
    return this.validTokens.has(cleanToken);
  }

  public getMode(): string {
    return this.mode;
  }
}
