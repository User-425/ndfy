import type { MessageRepository, FindMessagesOptions } from '../storage/message-repository.js';
import type { MessageBroker } from '../realtime/broker.js';
import type { UpstreamService } from '../upstream/upstream-service.js';
import type { PublishParams, NtfyMessage } from './models.js';
import { validateTopic } from '../security/topic-validator.js';
import { generateMessageId } from '../utils/id.js';
import { nowUnix, parseDelay } from '../utils/time.js';
import { parsePriority } from '../compatibility/ntfy-priority.js';
import type { Logger } from '../utils/logger.js';

export interface MessageServiceConfig {
  defaultCacheTtl: number;
  messageSizeLimit: number;
}

export class MessageService {
  private repo: MessageRepository;
  private broker: MessageBroker;
  private upstream?: UpstreamService;
  private config: MessageServiceConfig;
  private logger?: Logger;

  constructor(
    repo: MessageRepository,
    broker: MessageBroker,
    config: MessageServiceConfig,
    upstream?: UpstreamService,
    logger?: Logger
  ) {
    this.repo = repo;
    this.broker = broker;
    this.config = config;
    this.upstream = upstream;
    this.logger = logger;
  }

  /**
   * Publish a message.
   */
  public async publish(params: PublishParams): Promise<NtfyMessage> {
    const topic = validateTopic(params.topic);
    const id = params.id || generateMessageId();
    const time = nowUnix();
    const expires = time + this.config.defaultCacheTtl;
    const priority = parsePriority(params.priority);
    const cache = params.cache !== false;

    // Check message body size
    if (params.message && Buffer.byteLength(params.message, 'utf8') > this.config.messageSizeLimit) {
      throw new Error(`Message body exceeds maximum size of ${this.config.messageSizeLimit} bytes`);
    }

    const message: NtfyMessage = {
      id,
      time,
      expires,
      event: 'message',
      topic,
    };

    if (params.message !== undefined && params.message !== '') message.message = params.message;
    if (params.title !== undefined && params.title !== '') message.title = params.title;
    if (priority !== 3) message.priority = priority;
    if (params.tags && params.tags.length > 0) message.tags = params.tags;
    if (params.click) message.click = params.click;
    if (params.icon) message.icon = params.icon;
    if (params.actions && params.actions.length > 0) message.actions = params.actions;
    if (params.attachment) message.attachment = params.attachment;
    if (params.pollId) message.poll_id = params.pollId;

    // Check if delayed delivery is requested
    const scheduledAt = parseDelay(params.delay, time);

    if (scheduledAt && scheduledAt > time) {
      // Delayed message: persist with scheduled_at, do not dispatch to broker yet
      this.repo.save(message, { scheduledAt, createdAt: time });
      this.logger?.info({ id, topic, scheduledAt }, 'Message scheduled for delayed delivery');
      return message;
    }

    // Immediate message: persist in cache if caching is enabled
    if (cache) {
      this.repo.save(message, { createdAt: time });
    }

    // Publish to in-memory real-time broker
    const subscriberCount = this.broker.publish(message);
    this.logger?.debug({ id, topic, subscriberCount }, 'Message published to realtime broker');

    // Trigger upstream wake-up push asynchronously if upstream is configured
    if (this.upstream) {
      this.upstream.sendPollRequest(topic, id).catch((err) => {
        this.logger?.error({ err, topic, id }, 'Upstream push notification failed');
      });
    }

    return message;
  }

  /**
   * Query historical cached messages.
   */
  public queryCachedMessages(topic: string, options: FindMessagesOptions = {}): NtfyMessage[] {
    const validTopic = validateTopic(topic);
    return this.repo.findByTopic(validTopic, options);
  }

  /**
   * Direct broadcast of scheduled message when due.
   */
  public dispatchScheduledMessage(message: NtfyMessage): void {
    this.broker.publish(message);
    if (this.upstream) {
      this.upstream.sendPollRequest(message.topic, message.id).catch((err) => {
        this.logger?.error({ err, topic: message.topic, id: message.id }, 'Upstream push notification failed');
      });
    }
  }

  public getBroker(): MessageBroker {
    return this.broker;
  }

  public getRepository(): MessageRepository {
    return this.repo;
  }
}
