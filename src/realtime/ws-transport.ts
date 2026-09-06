import type { WebSocket } from 'ws';
import type { Subscriber } from './subscriber.js';
import type { NtfyEvent } from '../compatibility/ntfy-events.js';
import { serializeNtfyEvent } from '../compatibility/ntfy-message.js';
import { generateSubscriberId } from '../utils/id.js';

export class WebSocketSubscriber implements Subscriber {
  public readonly id: string;
  public readonly topic: string;
  public isClosed = false;
  private ws: WebSocket;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private onCloseCallback?: () => void;

  constructor(
    topic: string,
    ws: WebSocket,
    keepaliveIntervalSeconds = 45,
    onClose?: () => void
  ) {
    this.id = generateSubscriberId();
    this.topic = topic;
    this.ws = ws;
    this.onCloseCallback = onClose;

    // Handle WebSocket close/error
    this.ws.on('close', () => {
      this.close();
    });
    this.ws.on('error', () => {
      this.close();
    });

    // Emit initial 'open' event
    this.send({ event: 'open', topic: this.topic });

    // Setup keepalive timer
    if (keepaliveIntervalSeconds > 0) {
      this.keepaliveTimer = setInterval(() => {
        if (!this.isClosed && this.ws.readyState === this.ws.OPEN) {
          this.send({ event: 'keepalive', topic: this.topic });
        }
      }, keepaliveIntervalSeconds * 1000);
      if (this.keepaliveTimer.unref) {
        this.keepaliveTimer.unref();
      }
    }
  }

  public send(event: NtfyEvent): void {
    if (this.isClosed || this.ws.readyState !== this.ws.OPEN) return;
    try {
      const payload = serializeNtfyEvent(event);
      this.ws.send(payload);
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
      if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
        this.ws.close();
      }
    } catch {
      // ignore
    }

    if (this.onCloseCallback) {
      this.onCloseCallback();
      this.onCloseCallback = undefined;
    }
  }
}
