import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { authService } from "@/lib/auth/session";
import { SupabaseCallSignaling } from "@/lib/infra/supabase/supabase-signaling";
import type { SignalPayload } from "@/lib/ports/signaling";
import { rtcConfig } from "@/lib/webrtc-config";
import { createCall, updateCallStatus, type CallPeer, type CallType } from "@/lib/calls.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { CallOverlay, IncomingCallDialog } from "./call-ui";

export type CallState =
  | "IDLE"
  | "OUTGOING"
  | "RINGING"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DECLINED"
  | "MISSED"
  | "ENDED"
  | "FAILED";

type ActiveCall = {
  id: string;
  conversationId: string;
  peerId: string;
  peer: CallPeer | null;
  type: CallType;
  outgoing: boolean;
};

type CallContextValue = {
  state: CallState;
  active: ActiveCall | null;
  startCall: (args: {
    conversationId: string;
    peerId: string;
    peer: CallPeer | null;
    type: CallType;
  }) => Promise<void>;
  error: string | null;
};

const CallContext = createContext<CallContextValue>({
  state: "IDLE",
  active: null,
  startCall: async () => {},
  error: null,
});

export function useCalls() {
  return useContext(CallContext);
}

const RING_TIMEOUT_MS = 35_000;

export function CallProvider({ children }: { children: ReactNode }) {
  const [myId, setMyId] = useState<string | null>(null);
  const [state, setState] = useState<CallState>("IDLE");
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<{
    payload: SignalPayload;
    offer: RTCSessionDescriptionInit;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const signalingRef = useRef(new SupabaseCallSignaling());
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const startedAt = useRef<number | null>(null);
  const ringtoneRef = useRef<{ ctx: AudioContext; stop: () => void } | null>(null);
  const myProfileRef = useRef<CallPeer | null>(null);
  // Mirror incoming in a ref so signaling closures always read the current value
  // without being listed as a useEffect dependency (which would tear down the channel).
  const incomingRef = useRef<{ payload: SignalPayload; offer: RTCSessionDescriptionInit } | null>(null);

  activeRef.current = active;
  incomingRef.current = incoming;

  /* -------------------- my trusted profile (for signaling) -------------------- */
  const fetchMyProfile = useServerFn(getMyProfile);
  useEffect(() => {
    if (!myId) {
      myProfileRef.current = null;
      return;
    }
    let alive = true;
    fetchMyProfile()
      .then((p) => {
        if (!alive || !p) return;
        myProfileRef.current = {
          id: p.id,
          username: p.username ?? null,
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
        };
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [myId, fetchMyProfile]);


  /* ------------------------------ session ------------------------------ */
  useEffect(() => {
    let alive = true;
    authService.getSession().then(({ data }) => {
      if (alive) setMyId(data.session?.user.id ?? null);
    });
    const { data: sub } = authService.onAuthStateChange((_e, session) =>
      setMyId(session?.user.id ?? null),
    );
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /* ----------------------------- signaling ----------------------------- */
  const sendSignal = useCallback(
    async (targetUserId: string, event: string, payload: SignalPayload) => {
      await signalingRef.current.send(targetUserId, event, payload);
    },
    [],
  );

  /* ------------------------------ ringtone ----------------------------- */
  const startRingtone = useCallback(() => {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 440;
      osc.connect(gain);
      osc.start();
      let on = false;
      const interval = setInterval(() => {
        on = !on;
        gain.gain.setTargetAtTime(on ? 0.05 : 0.0001, ctx.currentTime, 0.02);
      }, 700);
      ringtoneRef.current = {
        ctx,
        stop: () => {
          clearInterval(interval);
          try {
            osc.stop();
          } catch {
            /* noop */
          }
          ctx.close().catch(() => {});
        },
      };
      // Browsers may block autoplay; resume() is a no-op failure at worst.
      ctx.resume().catch(() => {});
    } catch {
      /* ringtone is best-effort */
    }
  }, []);

  const stopRingtone = useCallback(() => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
  }, []);

  /* ------------------------------ teardown ----------------------------- */
  const teardown = useCallback(() => {
    stopRingtone();
    if (ringTimer.current) clearTimeout(ringTimer.current);
    ringTimer.current = null;
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;
    pcRef.current?.getSenders().forEach((s) => {
      try {
        s.track?.stop();
      } catch {
        /* noop */
      }
    });
    try {
      pcRef.current?.close();
    } catch {
      /* noop */
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    pendingCandidates.current = [];
    startedAt.current = null;
    setSeconds(0);
    setMuted(false);
    setCameraOff(false);
  }, [stopRingtone]);

  const finish = useCallback(
    (next: CallState, notifyPeer: boolean, status?: "ended" | "declined" | "missed" | "failed") => {
      const call = activeRef.current;
      const duration = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0;
      teardown();
      setState(next);
      if (call) {
        if (notifyPeer) {
          void sendSignal(call.peerId, "call-end", {
            call_id: call.id,
            from: myId ?? "",
            reason: status,
          });
        }
        if (status) {
          void updateCallStatus({
            data: { call_id: call.id, status, duration_seconds: duration },
          }).catch(() => {});
        }
      }
      setTimeout(() => {
        setActive(null);
        setState("IDLE");
      }, 1400);
    },
    [myId, sendSignal, teardown],
  );

  /* --------------------------- peer connection -------------------------- */
  const buildPeerConnection = useCallback(
    (peerId: string, callId: string) => {
      const pc = new RTCPeerConnection(rtcConfig());
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          void sendSignal(peerId, "ice-candidate", {
            call_id: callId,
            from: myId ?? "",
            candidate: e.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (stream) setRemoteStream(stream);
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") {
          setState("CONNECTED");
          if (!startedAt.current) {
            startedAt.current = Date.now();
            tickTimer.current = setInterval(
              () =>
                setSeconds(
                  startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0,
                ),
              1000,
            );
          }
        } else if (s === "disconnected") {
          setState("RECONNECTING");
        } else if (s === "failed") {
          setError("Connection lost");
          finish("FAILED", true, "failed");
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [finish, myId, sendSignal],
  );

  const getMedia = useCallback(async (type: CallType) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video" ? { facingMode: "user" } : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new Error(
          type === "video"
            ? "Camera and microphone access is required for video calls."
            : "Microphone access is required for voice calls.",
        );
      }
      throw new Error("Could not access your microphone or camera.");
    }
  }, []);

  /* ------------------------------ outgoing ----------------------------- */
  const startCall = useCallback(
    async ({
      conversationId,
      peerId,
      peer,
      type,
    }: {
      conversationId: string;
      peerId: string;
      peer: CallPeer | null;
      type: CallType;
    }) => {
      if (activeRef.current || !myId) return;
      if (peerId === myId) return;
      setError(null);
      try {
        const stream = await getMedia(type);
        const row = await createCall({
          data: { conversation_id: conversationId, callee_id: peerId, call_type: type },
        });
        const call: ActiveCall = {
          id: row.id,
          conversationId,
          peerId,
          peer,
          type,
          outgoing: true,
        };
        setActive(call);
        activeRef.current = call;
        setState("OUTGOING");

        const pc = buildPeerConnection(peerId, row.id);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(peerId, "call-offer", {
          call_id: row.id,
          from: myId,
          conversation_id: conversationId,
          call_type: type,
          peer: myProfileRef.current,
          sdp: offer,
        });

        ringTimer.current = setTimeout(() => {
          setError("No answer");
          finish("MISSED", true, "missed");
        }, RING_TIMEOUT_MS);
      } catch (e) {
        teardown();
        setError(e instanceof Error ? e.message : "Could not start the call");
        setState("FAILED");
        setTimeout(() => {
          setState("IDLE");
          setActive(null);
        }, 2500);
      }
    },
    [buildPeerConnection, finish, getMedia, myId, sendSignal, teardown],
  );

  /* ------------------------------ incoming ----------------------------- */
  const acceptIncoming = useCallback(async () => {
    if (!incoming || !myId) return;
    stopRingtone();
    const p = incoming.payload;
    const type = p.call_type ?? "voice";
    setError(null);

    const call: ActiveCall = {
      id: p.call_id,
      conversationId: p.conversation_id ?? "",
      peerId: p.from,
      peer: p.peer ?? null,
      type,
      outgoing: false,
    };

    setActive(call);
    activeRef.current = call;
    setIncoming(null);
    setState("CONNECTING");

    try {
      const stream = await getMedia(type);
      const pc = buildPeerConnection(p.from, p.call_id);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offerInit: RTCSessionDescriptionInit =
        typeof incoming.offer === "string"
          ? { type: "offer", sdp: incoming.offer }
          : incoming.offer;

      await pc.setRemoteDescription(new RTCSessionDescription(offerInit));

      const candidatesToProcess = [...pendingCandidates.current];
      pendingCandidates.current = [];
      for (const c of candidatesToProcess) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await sendSignal(p.from, "call-answer", { call_id: p.call_id, from: myId, sdp: answer });
      await updateCallStatus({ data: { call_id: p.call_id, status: "accepted" } }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not answer the call");
      teardown();
      setState("FAILED");
      setTimeout(() => {
        setState("IDLE");
        setActive(null);
      }, 2500);
    }
  }, [buildPeerConnection, getMedia, incoming, myId, sendSignal, stopRingtone, teardown]);

  const declineIncoming = useCallback(async () => {
    if (!incoming || !myId) return;
    stopRingtone();
    const p = incoming.payload;
    setIncoming(null);
    setState("DECLINED");
    pendingCandidates.current = [];

    await sendSignal(p.from, "call-decline", { call_id: p.call_id, from: myId });
    await updateCallStatus({ data: { call_id: p.call_id, status: "declined" } }).catch(() => {});

    setTimeout(() => {
      setState("IDLE");
      setActive(null);
    }, 1400);
  }, [incoming, myId, sendSignal, stopRingtone]);

  /* ------------------------- inbound signal wiring ---------------------- */
  //
  // IMPORTANT: This effect depends ONLY on [myId].
  //
  // Previously `incoming` was listed as a dependency, which caused React to tear
  // down and recreate the Supabase Realtime channel subscription every time an
  // offer arrived (i.e. the moment `setIncoming()` was called). During the
  // ~300-1000 ms while the new channel was re-subscribing, ICE candidates sent
  // by the caller were silently dropped, leaving the PeerConnection stuck in
  // "checking" forever.
  //
  // All mutable values that need to be read inside the handlers are accessed
  // through stable refs (incomingRef, activeRef, etc.) so no re-subscription
  // is ever needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!myId) return;

    const unsubscribe = signalingRef.current.listen(myId, {
      onOffer: (p) => {
        if (!p?.sdp || p.from === myId) return;
        // Use ref to avoid stale closure — does not re-run the effect
        if (activeRef.current || incomingRef.current) {
          void signalingRef.current.send(p.from, "call-decline", { call_id: p.call_id, from: myId });
          void updateCallStatus({ data: { call_id: p.call_id, status: "missed" } }).catch(() => {});
          return;
        }
        setIncoming({ payload: p, offer: p.sdp });
        setState("RINGING");
        // Use ref for ringtone — no re-run needed
        ringtoneRef.current === null && (() => {
          try {
            const Ctor =
              window.AudioContext ??
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return;
            const ctx = new Ctor();
            const gain = ctx.createGain();
            gain.gain.value = 0.0001;
            gain.connect(ctx.destination);
            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.value = 440;
            osc.connect(gain);
            osc.start();
            let on = false;
            const interval = setInterval(() => {
              on = !on;
              gain.gain.setTargetAtTime(on ? 0.05 : 0.0001, ctx.currentTime, 0.02);
            }, 700);
            ringtoneRef.current = {
              ctx,
              stop: () => {
                clearInterval(interval);
                try { osc.stop(); } catch { /* noop */ }
                ctx.close().catch(() => {});
              },
            };
            ctx.resume().catch(() => {});
          } catch { /* best-effort */ }
        })();
      },
      onAnswer: async (p) => {
        const pc = pcRef.current;
        if (!pc || !p?.sdp || activeRef.current?.id !== p.call_id || p.from !== activeRef.current?.peerId) return;
        if (ringTimer.current) clearTimeout(ringTimer.current);
        setState("CONNECTING");
        const answerInit: RTCSessionDescriptionInit =
          typeof p.sdp === "string"
            ? { type: "answer", sdp: p.sdp }
            : p.sdp;
        await pc.setRemoteDescription(new RTCSessionDescription(answerInit)).catch(() => {});
        const candidatesToProcess = [...pendingCandidates.current];
        pendingCandidates.current = [];
        for (const c of candidatesToProcess) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
      },
      onIce: async (p) => {
        if (!p?.candidate) return;
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
        } else {
          pendingCandidates.current.push(p.candidate);
        }
      },
      onDecline: (p) => {
        if (activeRef.current?.id !== p.call_id || p.from !== activeRef.current?.peerId) return;
        setError("Call declined");
        // Inline finish to avoid dep on the finish callback
        const call = activeRef.current;
        const duration = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0;
        ringtoneRef.current?.stop(); ringtoneRef.current = null;
        if (ringTimer.current) clearTimeout(ringTimer.current);
        ringTimer.current = null;
        if (tickTimer.current) clearInterval(tickTimer.current);
        tickTimer.current = null;
        pcRef.current?.getSenders().forEach((s) => { try { s.track?.stop(); } catch { /* noop */ } });
        try { pcRef.current?.close(); } catch { /* noop */ }
        pcRef.current = null;
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null); setRemoteStream(null);
        pendingCandidates.current = [];
        startedAt.current = null;
        setSeconds(0); setMuted(false); setCameraOff(false);
        setState("DECLINED");
        if (call) void updateCallStatus({ data: { call_id: call.id, status: "declined", duration_seconds: duration } }).catch(() => {});
        setTimeout(() => { setActive(null); setState("IDLE"); }, 1400);
      },
      onEnd: (p) => {
        // Use incomingRef so we never capture a stale value
        const currentIncoming = incomingRef.current;
        if (currentIncoming?.payload.call_id === p.call_id && p.from === currentIncoming.payload.from) {
          ringtoneRef.current?.stop(); ringtoneRef.current = null;
          setIncoming(null);
          setState("IDLE");
          return;
        }
        if (activeRef.current?.id !== p.call_id || p.from !== activeRef.current?.peerId) return;
        const duration = startedAt.current
          ? Math.round((Date.now() - startedAt.current) / 1000)
          : 0;
        // Inline teardown to avoid dep on the teardown callback
        ringtoneRef.current?.stop(); ringtoneRef.current = null;
        if (ringTimer.current) clearTimeout(ringTimer.current);
        ringTimer.current = null;
        if (tickTimer.current) clearInterval(tickTimer.current);
        tickTimer.current = null;
        pcRef.current?.getSenders().forEach((s) => { try { s.track?.stop(); } catch { /* noop */ } });
        try { pcRef.current?.close(); } catch { /* noop */ }
        pcRef.current = null;
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null); setRemoteStream(null);
        pendingCandidates.current = [];
        startedAt.current = null;
        setSeconds(0); setMuted(false); setCameraOff(false);
        setState("ENDED");
        void updateCallStatus({
          data: { call_id: p.call_id, status: "ended", duration_seconds: duration },
        }).catch(() => {});
        setTimeout(() => {
          setActive(null);
          setState("IDLE");
        }, 1400);
      },
    });

    return unsubscribe;
  // Only re-subscribe when the authenticated user changes.
  // All other values are accessed via stable refs.
  }, [myId]);

  /* ---------------------------- cleanup on exit -------------------------- */
  useEffect(() => {
    const signaling = signalingRef.current;
    const onUnload = () => teardown();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      teardown();
      signaling.dispose();
    };
  }, [teardown]);

  /* ------------------------------- controls ----------------------------- */
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
  }, [cameraOff]);

  const hangUp = useCallback(() => {
    finish("ENDED", true, "ended");
  }, [finish]);

  const value = useMemo<CallContextValue>(
    () => ({ state, active, startCall, error }),
    [state, active, startCall, error],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {incoming && (
        <IncomingCallDialog
          peer={incoming.payload.peer ?? null}
          type={incoming.payload.call_type ?? "voice"}
          onAccept={() => void acceptIncoming()}
          onDecline={() => void declineIncoming()}
        />
      )}
      {active && (
        <CallOverlay
          state={state}
          call={active}
          seconds={seconds}
          muted={muted}
          cameraOff={cameraOff}
          error={error}
          localStream={localStream}
          remoteStream={remoteStream}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onHangUp={hangUp}
        />
      )}
    </CallContext.Provider>
  );
}

export type { ActiveCall };
