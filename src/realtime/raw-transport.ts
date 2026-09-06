import type { ServerResponse } from 'node:http';
import type { Subscriber } from './subscriber.js';
import type { NtfyEvent } from '../compatibility/ntfy-events.js';
import { generateSubscriberId } from '../utils/id.js';

export class RawStreamSubscriber implements Subscriber {
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

    // Set raw stream headers
    this.res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Handle client disconnect
    this.res.on('close', () => {
      this.close();
    });

    // Setup keepalive timer (empty line in raw format)
    if (keepaliveIntervalSeconds > 0) {
      this.keepaliveTimer = setInterval(() => {
        if (!this.isClosed) {
          try {
            this.res.write('\n');
          } catch {
            this.close();
          }
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
      if (event.event === 'message') {
        const body = event.message || '';
        this.res.write(body + '\n');
      }
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
