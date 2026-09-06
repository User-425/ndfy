import type { NtfyMessage } from './ntfy-message.js';

export type NtfyEventType = 'open' | 'keepalive' | 'message' | 'poll_request';

export interface NtfyOpenEvent {
  event: 'open';
  topic: string;
}

export interface NtfyKeepaliveEvent {
  event: 'keepalive';
  topic: string;
}

export interface NtfyPollRequestEvent {
  event: 'poll_request';
  topic: string;
  poll_id: string;
}

export type NtfyEvent = NtfyOpenEvent | NtfyKeepaliveEvent | NtfyMessage | NtfyPollRequestEvent;
