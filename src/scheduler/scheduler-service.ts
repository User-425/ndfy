import type { MessageRepository } from '../storage/message-repository.js';
import type { MessageService } from '../domain/message-service.js';
import { nowUnix } from '../utils/time.js';
import type { Logger } from '../utils/logger.js';

export interface SchedulerConfig {
  cleanupIntervalSeconds: number; // e.g. 300s
  scheduledPollIntervalMs?: number; // e.g. 1000ms
}

export class SchedulerService {
  private repo: MessageRepository;
  private messageService: MessageService;
  private config: SchedulerConfig;
  private logger?: Logger;
  private scheduledTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    repo: MessageRepository,
    messageService: MessageService,
    config: SchedulerConfig,
    logger?: Logger
  ) {
    this.repo = repo;
    this.messageService = messageService;
    this.config = config;
    this.logger = logger;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const pollInterval = this.config.scheduledPollIntervalMs ?? 1000;

    // Timer for checking scheduled/delayed messages
    this.scheduledTimer = setInterval(() => {
      this.checkScheduledMessages();
    }, pollInterval);
    if (this.scheduledTimer.unref) {
      this.scheduledTimer.unref();
    }

    // Timer for cleaning up expired messages
    const cleanupIntervalMs = this.config.cleanupIntervalSeconds * 1000;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredMessages();
    }, cleanupIntervalMs);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }

    this.logger?.info('Scheduler service started');
  }

  public checkScheduledMessages(): void {
    try {
      const now = nowUnix();
      const due = this.repo.findDueScheduled(now);

      for (const item of due) {
        this.logger?.info({ id: item.message.id, topic: item.message.topic }, 'Dispatching scheduled message');
        this.messageService.dispatchScheduledMessage(item.message);
        this.repo.clearScheduled(item.message.id);
      }
    } catch (err) {
      this.logger?.error({ err }, 'Error checking scheduled messages');
    }
  }

  public cleanupExpiredMessages(): void {
    try {
      const now = nowUnix();
      const deletedCount = this.repo.deleteExpired(now);
      if (deletedCount > 0) {
        this.logger?.info({ deletedCount }, 'Cleaned up expired messages from cache');
      }
    } catch (err) {
      this.logger?.error({ err }, 'Error cleaning up expired messages');
    }
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer);
      this.scheduledTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.logger?.info('Scheduler service stopped');
  }
}
