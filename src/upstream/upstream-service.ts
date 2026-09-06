import crypto from 'node:crypto';
import type { Logger } from '../utils/logger.js';

export interface UpstreamConfig {
  enabled: boolean;
  publicBaseUrl: string;
  upstreamBaseUrl: string;
  upstreamAccessToken?: string;
}

export class UpstreamService {
  private config: UpstreamConfig;
  private logger?: Logger;

  constructor(config: UpstreamConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Derive canonical topic URL from public base URL and topic.
   */
  public getCanonicalTopicUrl(topic: string): string {
    const base = this.config.publicBaseUrl.replace(/\/+$/, '');
    return `${base}/${topic}`;
  }

  /**
   * Calculate SHA-256 hash of the canonical topic URL.
   * This hash is used as the topic name on upstream ntfy server for wake-up.
   */
  public getUpstreamTopicHash(topic: string): string {
    const canonicalUrl = this.getCanonicalTopicUrl(topic);
    return crypto.createHash('sha256').update(canonicalUrl).digest('hex');
  }

  /**
   * Send upstream wake-up poll request to wake ntfy mobile app.
   * Does NOT send private message content.
   */
  public async sendPollRequest(topic: string, messageId: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const upstreamTopic = this.getUpstreamTopicHash(topic);
    const targetUrl = `${this.config.upstreamBaseUrl.replace(/\/+$/, '')}/${upstreamTopic}`;

    const headers: Record<string, string> = {
      'X-Poll-ID': messageId,
      'Content-Type': 'text/plain',
    };

    if (this.config.upstreamAccessToken) {
      headers['Authorization'] = `Bearer ${this.config.upstreamAccessToken}`;
    }

    try {
      this.logger?.debug({ topic, upstreamTopic, targetUrl, messageId }, 'Sending upstream wake-up poll request');
      
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: '', // Empty body, mobile client will fetch actual content from our server
      });

      if (!response.ok) {
        this.logger?.warn(
          { status: response.status, topic, upstreamTopic },
          'Upstream wake-up request returned non-OK status'
        );
        return false;
      }

      return true;
    } catch (err) {
      this.logger?.error({ err, topic, upstreamTopic }, 'Failed to send upstream wake-up poll request');
      return false;
    }
  }
}
