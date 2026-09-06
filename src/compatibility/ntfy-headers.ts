import { parsePriority } from './ntfy-priority.js';
import type { NtfyAction } from './ntfy-message.js';

export interface ParsedPublishHeaders {
  title?: string;
  priority?: number;
  tags?: string[];
  click?: string;
  icon?: string;
  actions?: NtfyAction[];
  markdown?: boolean;
  delay?: string;
  cache: boolean;
  pollId?: string;
  filename?: string;
  attachUrl?: string;
}

/**
 * Get header value by checking multiple alias names case-insensitively.
 */
export function getHeader(
  headers: Record<string, string | string[] | undefined>,
  ...aliases: string[]
): string | undefined {
  const lowerAliases = aliases.map((a) => a.toLowerCase());
  for (const [key, val] of Object.entries(headers)) {
    if (lowerAliases.includes(key.toLowerCase())) {
      if (Array.isArray(val)) {
        return val[0];
      }
      return val;
    }
  }
  return undefined;
}

/**
 * Parses actions header which can be:
 * 1. A JSON array of action objects: '[{"action":"view","label":"Open","url":"https://..."}]'
 * 2. Ntfy action parameter strings: 'view, Open website, https://example.com; http, Turn off light, https://.../off, method=POST'
 */
export function parseActionsHeader(headerVal?: string): NtfyAction[] | undefined {
  if (!headerVal) return undefined;
  const trimmed = headerVal.trim();
  if (!trimmed) return undefined;

  // Try parsing JSON first
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as NtfyAction[];
      }
    } catch {
      // Not valid JSON, fallback to ntfy action syntax
    }
  }

  // Parse ntfy action shorthand
  const actions: NtfyAction[] = [];
  const actionEntries = trimmed.split(';').map((s) => s.trim()).filter(Boolean);

  for (const entry of actionEntries) {
    const parts = entry.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;

    const actionType = parts[0].toLowerCase();
    const label = parts[1];

    if (actionType === 'view') {
      const url = parts[2];
      actions.push({ action: 'view', label, url });
    } else if (actionType === 'broadcast') {
      actions.push({ action: 'broadcast', label });
    } else if (actionType === 'http') {
      const url = parts[2];
      const action: NtfyAction = { action: 'http', label, url };
      // Parse key=value options in remaining parts
      for (let i = 3; i < parts.length; i++) {
        const [k, ...v] = parts[i].split('=');
        const key = k?.trim().toLowerCase();
        const value = v.join('=').trim();
        if (key === 'method') {
          action.method = value.toUpperCase();
        } else if (key === 'body') {
          action.body = value;
        } else if (key === 'clear') {
          action.clear = value === 'true' || value === '1' || value === 'yes';
        }
      }
      actions.push(action);
    }
  }

  return actions.length > 0 ? actions : undefined;
}

/**
 * Parse and normalize all ntfy publishing headers from a request.
 */
export function parsePublishHeaders(
  headers: Record<string, string | string[] | undefined>
): ParsedPublishHeaders {
  // Title
  const title = getHeader(headers, 'Title', 'X-Title', 't');

  // Priority
  const prioHeader = getHeader(headers, 'Priority', 'X-Priority', 'p', 'Prio');
  const priority = prioHeader !== undefined ? parsePriority(prioHeader) : undefined;

  // Tags
  const tagsHeader = getHeader(headers, 'Tags', 'X-Tags', 'tag', 'ta');
  let tags: string[] | undefined;
  if (tagsHeader) {
    tags = tagsHeader
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // Click URL
  const click = getHeader(headers, 'Click', 'X-Click');

  // Icon URL
  const icon = getHeader(headers, 'Icon', 'X-Icon');

  // Actions
  const actionsHeader = getHeader(headers, 'Actions', 'X-Actions');
  const actions = parseActionsHeader(actionsHeader);

  // Markdown
  const mdHeader = getHeader(headers, 'Markdown', 'X-Markdown', 'md');
  const markdown =
    mdHeader !== undefined
      ? mdHeader === '1' || mdHeader.toLowerCase() === 'yes' || mdHeader.toLowerCase() === 'true'
      : undefined;

  // Delay / Schedule
  const delay = getHeader(headers, 'Delay', 'X-Delay', 'X-Schedule');

  // Cache
  const cacheHeader = getHeader(headers, 'Cache', 'X-Cache');
  const cache =
    cacheHeader !== undefined
      ? !(cacheHeader === '0' || cacheHeader.toLowerCase() === 'no' || cacheHeader.toLowerCase() === 'false')
      : true;

  // Poll ID (used by upstream mobile wake up)
  const pollId = getHeader(headers, 'X-Poll-ID', 'Poll-ID', 'poll_id');

  // Attach / Filename
  const attachUrl = getHeader(headers, 'Attach', 'X-Attach', 'a');
  const filename = getHeader(headers, 'Filename', 'X-Filename');

  return {
    title,
    priority,
    tags: tags && tags.length > 0 ? tags : undefined,
    click,
    icon,
    actions,
    markdown,
    delay,
    cache,
    pollId,
    filename,
    attachUrl,
  };
}
