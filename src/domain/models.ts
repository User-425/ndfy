import type { NtfyMessage, NtfyAction, NtfyAttachment } from '../compatibility/ntfy-message.js';

export interface PublishParams {
  topic: string;
  message?: string;
  title?: string;
  priority?: number;
  tags?: string[];
  click?: string;
  icon?: string;
  actions?: NtfyAction[];
  attachment?: NtfyAttachment;
  delay?: string;
  cache?: boolean;
  pollId?: string;
  id?: string;
}

export type { NtfyMessage };
