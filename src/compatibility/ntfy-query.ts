import { parseSince, type SinceOption } from '../utils/time.js';
import { parsePriority } from './ntfy-priority.js';

export interface SubscriptionQueryOptions {
  poll: boolean;
  since: SinceOption | null;
  scheduled: boolean;
  id?: string;
  message?: string;
  title?: string;
  priority?: number;
  tags?: string[];
}

export function parseSubscriptionQuery(
  query: Record<string, string | string[] | undefined>
): SubscriptionQueryOptions {
  const getQueryVal = (key: string): string | undefined => {
    const val = query[key] || query[key.toLowerCase()];
    if (Array.isArray(val)) return val[0];
    return val;
  };

  const pollVal = getQueryVal('poll') || getQueryVal('p');
  const poll = pollVal === '1' || pollVal === 'yes' || pollVal === 'true';

  const sinceVal = getQueryVal('since') || getQueryVal('s');
  const since = parseSince(sinceVal);

  const scheduledVal = getQueryVal('scheduled');
  const scheduled = scheduledVal === '1' || scheduledVal === 'yes' || scheduledVal === 'true';

  const id = getQueryVal('id');
  const message = getQueryVal('message') || getQueryVal('m');
  const title = getQueryVal('title') || getQueryVal('t');

  const prioVal = getQueryVal('priority') || getQueryVal('prio');
  const priority = prioVal !== undefined ? parsePriority(prioVal) : undefined;

  const tagsVal = getQueryVal('tags') || getQueryVal('tag') || getQueryVal('ta');
  const tags = tagsVal
    ? tagsVal
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  return {
    poll,
    since,
    scheduled,
    id,
    message,
    title,
    priority,
    tags,
  };
}
