import { describe, it, expect, vi } from 'vitest';
import { MessageBroker } from '../../src/realtime/broker.js';
import type { Subscriber } from '../../src/realtime/subscriber.js';
import type { NtfyEvent } from '../../src/compatibility/ntfy-events.js';
import type { NtfyMessage } from '../../src/compatibility/ntfy-message.js';

class MockSubscriber implements Subscriber {
  public id: string;
  public topic: string;
  public isClosed = false;
  public received: NtfyEvent[] = [];

  constructor(id: string, topic: string) {
    this.id = id;
    this.topic = topic;
  }

  send(event: NtfyEvent): void {
    if (!this.isClosed) {
      this.received.push(event);
    }
  }

  close(): void {
    this.isClosed = true;
  }
}

describe('MessageBroker', () => {
  it('subscribes, publishes, and unsubscribes correctly', () => {
    const broker = new MessageBroker();
    const sub1 = new MockSubscriber('sub1', 'alerts');
    const sub2 = new MockSubscriber('sub2', 'alerts');
    const sub3 = new MockSubscriber('sub3', 'metrics');

    broker.subscribe('alerts', sub1);
    broker.subscribe('alerts', sub2);
    broker.subscribe('metrics', sub3);

    expect(broker.subscriberCount()).toBe(3);
    expect(broker.subscriberCount('alerts')).toBe(2);
    expect(broker.subscriberCount('metrics')).toBe(1);

    const alertMsg: NtfyMessage = {
      id: 'msg_1',
      topic: 'alerts',
      time: 1700000000,
      event: 'message',
      message: 'CPU High',
    };

    const delivered = broker.publish(alertMsg);
    expect(delivered).toBe(2);
    expect(sub1.received).toHaveLength(1);
    expect(sub2.received).toHaveLength(1);
    expect(sub3.received).toHaveLength(0);

    // Unsubscribe sub1
    broker.unsubscribe('alerts', sub1);
    expect(broker.subscriberCount('alerts')).toBe(1);

    broker.publish(alertMsg);
    expect(sub1.received).toHaveLength(1); // unchanged
    expect(sub2.received).toHaveLength(2); // received second copy
  });

  it('handles closed subscribers gracefully', () => {
    const broker = new MessageBroker();
    const sub1 = new MockSubscriber('sub1', 'alerts');
    broker.subscribe('alerts', sub1);

    sub1.close();
    const alertMsg: NtfyMessage = {
      id: 'msg_1',
      topic: 'alerts',
      time: 1700000000,
      event: 'message',
      message: 'Test',
    };

    const count = broker.publish(alertMsg);
    expect(count).toBe(0);
    expect(sub1.received).toHaveLength(0);
  });
});
