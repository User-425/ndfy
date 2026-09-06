export interface NtfyAction {
  id?: string;
  action: 'view' | 'broadcast' | 'http';
  label: string;
  url?: string;
  clear?: boolean;
  body?: string;
  method?: string;
  headers?: Record<string, string>;
  intent?: string;
  extras?: Record<string, string>;
}

export interface NtfyAttachment {
  name: string;
  url: string;
  type?: string;
  size?: number;
  expires?: number;
}

export interface NtfyMessage {
  id: string;
  time: number;
  expires?: number;
  event: 'message';
  topic: string;
  message?: string;
  title?: string;
  priority?: number;
  tags?: string[];
  click?: string;
  icon?: string;
  actions?: NtfyAction[];
  attachment?: NtfyAttachment;
  poll_id?: string;
}

/**
 * Serializes an NtfyMessage or NtfyEvent to a clean JSON object
 * omitting undefined values to strictly match ntfy wire format.
 */
export function serializeNtfyEvent(event: Record<string, any>): string {
  return JSON.stringify(event, (_key, value) => {
    if (value === undefined) {
      return undefined;
    }
    return value;
  });
}
