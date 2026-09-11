import type { Call, CallHistoryItem, CallPeer, CallStatus, CallType } from "@/lib/domain/types";
import type { CallRepository, ProfileRepository } from "@/lib/repositories/ports";
import type { ICallPolicy } from "@/lib/auth/authorization";

export class CallService {
  constructor(
    private readonly userId: string,
    private readonly calls: CallRepository,
    private readonly profiles: ProfileRepository,
    private readonly callPolicy?: ICallPolicy,
  ) {}

  async create(input: {
    conversation_id: string;
    callee_id: string;
    call_type: CallType;
  }): Promise<Call> {
    if (this.callPolicy) {
      await this.callPolicy.requireInitiation(this.userId, input.conversation_id, input.callee_id);
    }
    return this.calls.insert({
      conversation_id: input.conversation_id,
      caller_id: this.userId,
      callee_id: input.callee_id,
      call_type: input.call_type,
      status: "ringing",
    });
  }

  async get(callId: string): Promise<{ call: Call; peer: CallPeer | null } | null> {
    let row: Call | null;
    if (this.callPolicy) {
      row = await this.callPolicy.requireParticipant(this.userId, callId);
    } else {
      row = await this.calls.getById(callId);
    }
    if (!row) return null;
    const peerId = row.caller_id === this.userId ? row.callee_id : row.caller_id;
    const peer = await this.profiles.getCallPeer(peerId);
    return { call: row, peer };
  }

  async updateStatus(
    callId: string,
    status: CallStatus,
    durationSeconds?: number,
  ): Promise<{ ok: true }> {
    if (this.callPolicy) {
      await this.callPolicy.requireParticipant(this.userId, callId);
    }
    const now = new Date().toISOString();
    const patch = {
      status,
      ...(status === "accepted" ? { started_at: now } : {}),
      ...(["ended", "declined", "missed", "failed"].includes(status)
        ? {
            ended_at: now,
            ...(durationSeconds !== undefined ? { duration_seconds: durationSeconds } : {}),
          }
        : {}),
    };
    await this.calls.updateStatus(callId, patch);
    return { ok: true };
  }

  async listHistory(): Promise<CallHistoryItem[]> {
    const rows = await this.calls.listForUser(this.userId, 100);
    const peerIds = Array.from(
      new Set(rows.map((r) => (r.caller_id === this.userId ? r.callee_id : r.caller_id))),
    );
    const peers = new Map<string, CallPeer>();
    if (peerIds.length > 0) {
      const profs = await this.profiles.getChatProfiles(peerIds);
      for (const p of profs) {
        peers.set(p.id, {
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        });
      }
    }
    return rows.map((r) => {
      const peerId = r.caller_id === this.userId ? r.callee_id : r.caller_id;
      const durationSeconds = r.ended_at && r.started_at
        ? Math.max(0, Math.floor((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000))
        : 0;
      return {
        ...r,
        direction: r.caller_id === this.userId ? ("outgoing" as const) : ("incoming" as const),
        peer: peers.get(peerId) ?? null,
        duration_seconds: durationSeconds,
      };
    });
  }

  async deleteFromHistory(callId: string): Promise<{ ok: true }> {
    await this.calls.deleteFromHistory(callId, this.userId);
    return { ok: true };
  }

  async deleteManyFromHistory(callIds: string[]): Promise<{ ok: true; count: number }> {
    const uniqueIds = Array.from(new Set(callIds));
    const count = await this.calls.deleteManyFromHistory(uniqueIds, this.userId);
    return { ok: true, count };
  }

  async clearHistory(): Promise<{ ok: true; count: number }> {
    const count = await this.calls.clearHistory(this.userId);
    return { ok: true, count };
  }
}
