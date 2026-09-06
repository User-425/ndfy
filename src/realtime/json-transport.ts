import type { ServerResponse } from 'node:http';
import type { Subscriber } from './subscriber.js';
import type { NtfyEvent } from '../compatibility/ntfy-events.js';
import { serializeNtfyEvent } from '../compatibility/ntfy-message.js';
import { generateSubscriberId } from '../utils/id.js';

export class JsonStreamSubscriber implements Subscriber {
  public readonly id: string;
  public readonly topic: string;
  public isClosed = false;
  private res: ServerResponse;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private onCloseCallback?: () => void;

  constructor(
    topic: string,
    res: ServerResponse,
    keepaliveIntervalSeconds = 45,
    onClose?: () => void
  ) {
    this.id = generateSubscriberId();
    this.topic = topic;
    this.res = res;
    this.onCloseCallback = onClose;

    // Set JSON stream headers
    this.res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Handle connection termination
    this.res.on('close', () => {
      this.close();
    });

    // Emit initial 'open' event
    this.send({ event: 'open', topic: this.topic });

    // Setup keepalive timer
    if (keepaliveIntervalSeconds > 0) {
      this.keepaliveTimer = setInterval(() => {
        if (!this.isClosed) {
          this.send({ event: 'keepalive', topic: this.topic });
        }
      }, keepaliveIntervalSeconds * 1000);
      if (this.keepaliveTimer.unref) {
        this.keepaliveTimer.unref();
      }
    }
  }

  public send(event: NtfyEvent): void {
    if (this.isClosed) return;
    try {
      const payload = serializeNtfyEvent(event) + '\n';
      this.res.write(payload);
    } catch {
      this.close();
    }
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }

    try {
      this.res.end();
    } catch {
      // ignore
    }

    if (this.onCloseCallback) {
      this.onCloseCallback();
      this.onCloseCallback = undefined;
    }
  }
}
