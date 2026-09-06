import type { NtfyEvent } from '../compatibility/ntfy-events.js';
import type { Subscriber } from './subscriber.js';

export class MessageBroker {
  private topics = new Map<string, Set<Subscriber>>();

  /**
   * Register a subscriber for a topic.
   */
  public subscribe(topic: string, subscriber: Subscriber): void {
    let subs = this.topics.get(topic);
    if (!subs) {
      subs = new Set<Subscriber>();
      this.topics.set(topic, subs);
    }
    subs.add(subscriber);
  }

  /**
   * Remove a subscriber from a topic.
   */
  public unsubscribe(topic: string, subscriber: Subscriber): void {
    const subs = this.topics.get(topic);
    if (subs) {
      subs.delete(subscriber);
      if (subs.size === 0) {
        this.topics.delete(topic);
      }
    }
  }

  /**
   * Publish an event to all subscribers listening to the event topic.
   * Returns the count of subscribers delivered to.
   */
  public publish(event: NtfyEvent): number {
    const subs = this.topics.get(event.topic);
    if (!subs || subs.size === 0) {
      return 0;
    }

    let count = 0;
    for (const sub of Array.from(subs)) {
      if (sub.isClosed) {
        subs.delete(sub);
      } else {
        try {
          sub.send(event);
          count++;
        } catch {
          // If sending fails, close and remove dead subscriber
          sub.close();
          subs.delete(sub);
        }
      }
    }

    if (subs.size === 0) {
      this.topics.delete(event.topic);
    }

    return count;
  }

  /**
   * Return subscriber count overall or for a specific topic.
   */
  public subscriberCount(topic?: string): number {
    if (topic) {
      return this.topics.get(topic)?.size || 0;
    }
    let total = 0;
    for (const subs of this.topics.values()) {
      total += subs.size;
    }
    return total;
  }

  /**
   * Close all active subscriber connections.
   */
  public closeAll(): void {
    for (const subs of this.topics.values()) {
      for (const sub of subs) {
        try {
          sub.close();
        } catch {
          // ignore
        }
      }
    }
    this.topics.clear();
  }
}
