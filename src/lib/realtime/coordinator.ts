import type { RealtimeDomainEvent } from "./contracts";

export interface IRealtimeCoordinator {
  /**
   * Broadcast an event across all Cloudflare isolates / nodes to subscribers of a channel.
   */
  broadcastToChannel(channel: string, event: RealtimeDomainEvent, senderNodeId?: string): Promise<void>;

  /**
   * Register a subscriber listener on this node for cross-node events.
   */
  onRemoteEvent(handler: (channel: string, event: RealtimeDomainEvent) => void): void;
}

/**
 * In-memory fallback coordinator for single-isolate / local test environments.
 */
export class LocalRealtimeCoordinator implements IRealtimeCoordinator {
  private handlers: Array<(channel: string, event: RealtimeDomainEvent) => void> = [];

  async broadcastToChannel(channel: string, event: RealtimeDomainEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        handler(channel, event);
      } catch (err) {
        console.error("[LOCAL_COORDINATOR_ERROR]", err);
      }
    }
  }

  onRemoteEvent(handler: (channel: string, event: RealtimeDomainEvent) => void): void {
    this.handlers.push(handler);
  }
}

/**
 * Durable Objects Channel-Scoped Realtime Coordinator Client
 * Coordinates multi-instance cross-isolate fanout per conversation / channel.
 */
export class DurableObjectRealtimeCoordinator implements IRealtimeCoordinator {
  private handlers: Array<(channel: string, event: RealtimeDomainEvent) => void> = [];
  public readonly nodeId: string;

  constructor(
    private readonly getDoStub?: (channel: string) => { fetch(url: string, init?: RequestInit): Promise<Response> } | null
  ) {
    this.nodeId = `node_${Math.random().toString(36).substring(2, 9)}`;
  }

  async broadcastToChannel(channel: string, event: RealtimeDomainEvent, senderNodeId?: string): Promise<void> {
    const node = senderNodeId || this.nodeId;
    if (this.getDoStub) {
      const stub = this.getDoStub(channel);
      if (stub) {
        try {
          await stub.fetch("https://do-coordinator/broadcast", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel, event, senderNodeId: node }),
          });
        } catch (err) {
          console.error("[DO_COORDINATOR_FETCH_ERROR]", err);
        }
      }
    }
    // Deliver locally to this node's registered handlers
    for (const handler of this.handlers) {
      handler(channel, event);
    }
  }

  onRemoteEvent(handler: (channel: string, event: RealtimeDomainEvent) => void): void {
    this.handlers.push(handler);
  }
}

let activeCoordinator: IRealtimeCoordinator = new LocalRealtimeCoordinator();

export function getRealtimeCoordinator(): IRealtimeCoordinator {
  return activeCoordinator;
}

export function setRealtimeCoordinator(coordinator: IRealtimeCoordinator) {
  activeCoordinator = coordinator;
}
