import type { NtfyEvent } from '../compatibility/ntfy-events.js';

export interface Subscriber {
  readonly id: string;
  readonly topic: string;
  readonly isClosed: boolean;
  send(event: NtfyEvent): void;
  close(): void;
}
