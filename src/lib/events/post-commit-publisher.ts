import type { Message } from "@/lib/domain/types";
import { createEventId, type RealtimeDomainEvent } from "@/lib/realtime/contracts";
import { getPostgresClient } from "@/lib/infra/postgres/client";
import { PushDispatcher } from "@/lib/push/push-dispatcher";

/**
 * The only fan-out boundary for committed message data. Persistence must finish
 * before this class is called; every consumer is isolated so delivery failures
 * can never invalidate a successfully stored message.
 */
export interface PostCommitConsumer {
  consume(event: RealtimeDomainEvent): Promise<void> | void;
}

export class PostCommitPublisher {
  constructor(private consumers: PostCommitConsumer[] = []) {}

  registerConsumer(consumer: PostCommitConsumer) {
    this.consumers.push(consumer);
  }

  async messageCreated(message: Message): Promise<void> {
    const event: RealtimeDomainEvent = {
      type: "message.created",
      conversation_id: message.conversation_id,
      message,
      event_id: createEventId(),
      timestamp: new Date().toISOString(),
    };
    await Promise.allSettled(this.consumers.map((consumer) => Promise.resolve(consumer.consume(event))));
  }
}

// Global singleton publisher wired with PushDispatcher
export const postCommitPublisher = new PostCommitPublisher();

// Dynamic lazy initialization of PushDispatcher when Neon driver is active
if (typeof process !== "undefined" && process.env?.DATA_REPOSITORY_DRIVER?.toLowerCase() === "neon") {
  try {
    const sql = getPostgresClient();
    postCommitPublisher.registerConsumer(new PushDispatcher(sql));
  } catch {
    // Environment may not have DATABASE_URL during static imports
  }
}
