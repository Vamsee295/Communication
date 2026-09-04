import type { CallPeer, CallType } from "@/lib/domain/types";

export type SignalPayload = {
  call_id: string;
  from: string;
  conversation_id?: string;
  call_type?: CallType;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  peer?: CallPeer | null;
  reason?: string;
};

export type CallSignalHandlers = {
  onOffer: (payload: SignalPayload) => void;
  onAnswer: (payload: SignalPayload) => void;
  onIce: (payload: SignalPayload) => void;
  onDecline: (payload: SignalPayload) => void;
  onEnd: (payload: SignalPayload) => void;
};

/** Transport-only. WebRTC media stays in call-provider. */
export interface CallSignaling {
  send(targetUserId: string, event: string, payload: SignalPayload): Promise<void>;
  listen(myId: string, handlers: CallSignalHandlers): () => void;
  dispose(): void;
}
