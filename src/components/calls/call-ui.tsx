import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Lock } from "lucide-react";
import type { CallPeer, CallType } from "@/lib/calls.functions";
import { formatDuration } from "@/lib/webrtc-config";

function peerName(peer: CallPeer | null) {
  return peer?.display_name ?? peer?.username ?? "Ghost";
}

function Avatar({ peer, size = "lg" }: { peer: CallPeer | null; size?: "lg" | "md" }) {
  const cls = size === "lg" ? "h-28 w-28 text-4xl" : "h-16 w-16 text-2xl";
  return (
    <div
      className={`grid ${cls} place-items-center rounded-full bg-primary/12 font-black text-primary ring-1 ring-primary/25`}
    >
      {peerName(peer).charAt(0).toUpperCase()}
    </div>
  );
}

export function IncomingCallDialog({
  peer,
  type,
  onAccept,
  onDecline,
}: {
  peer: CallPeer | null;
  type: CallType;
  onAccept: () => void;
  onDecline: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDecline();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecline]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-end bg-black/40 p-4 backdrop-blur-sm sm:place-items-center">
      <div className="glass animate-rise-in w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl">
        <div className="flex justify-center">
          <Avatar peer={peer} size="md" />
        </div>
        <h2 className="mt-4 text-xl font-extrabold">{peerName(peer)}</h2>
        {peer?.username && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">@{peer.username}</p>
        )}
        <p className="mt-1 text-sm text-primary">
          Incoming {type === "video" ? "video" : "voice"} call
        </p>
        <div className="mt-7 flex items-center justify-center gap-5">
          <button
            onClick={onDecline}
            className="press grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground"
            aria-label="Decline"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
          <button
            onClick={onAccept}
            className="press grid h-14 w-14 place-items-center rounded-full bg-success text-[#05060a]"
            aria-label="Accept"
          >
            {type === "video" ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function stateLabel(state: string, seconds: number, name: string, error: string | null) {
  switch (state) {
    case "OUTGOING":
      return `Calling ${name}…`;
    case "CONNECTING":
      return "Connecting…";
    case "CONNECTED":
      return formatDuration(seconds);
    case "RECONNECTING":
      return "Reconnecting…";
    case "DECLINED":
      return "Call declined";
    case "MISSED":
      return "No answer";
    case "ENDED":
      return "Call ended";
    case "FAILED":
      return error ?? "Unable to connect";
    default:
      return "";
  }
}

function Controls({
  type,
  muted,
  cameraOff,
  onToggleMute,
  onToggleCamera,
  onHangUp,
}: {
  type: CallType;
  muted: boolean;
  cameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onHangUp: () => void;
}) {
  const base =
    "press grid h-14 w-14 place-items-center rounded-full border border-border bg-surface-2/80 text-foreground";
  return (
    <div className="flex items-center justify-center gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button onClick={onToggleMute} className={base} aria-label={muted ? "Unmute" : "Mute"}>
        {muted ? <MicOff className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
      </button>
      <button
        onClick={onHangUp}
        className="press grid h-16 w-16 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lg"
        aria-label="End call"
      >
        <PhoneOff className="h-6 w-6" />
      </button>
      {type === "video" ? (
        <button
          onClick={onToggleCamera}
          className={base}
          aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
        >
          {cameraOff ? (
            <VideoOff className="h-5 w-5 text-destructive" />
          ) : (
            <Video className="h-5 w-5" />
          )}
        </button>
      ) : (
        <span className="h-14 w-14" />
      )}
    </div>
  );
}

export function CallOverlay({
  state,
  call,
  seconds,
  muted,
  cameraOff,
  error,
  localStream,
  remoteStream,
  onToggleMute,
  onToggleCamera,
  onHangUp,
}: {
  state: string;
  call: { peer: CallPeer | null; type: CallType };
  seconds: number;
  muted: boolean;
  cameraOff: boolean;
  error: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onHangUp: () => void;
}) {
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const name = peerName(call.peer);

  useEffect(() => {
    if (remoteVideo.current && remoteStream) remoteVideo.current.srcObject = remoteStream;
    if (remoteAudio.current && remoteStream) remoteAudio.current.srcObject = remoteStream;
    if (localVideo.current && localStream) localVideo.current.srcObject = localStream;
  }, [remoteStream, localStream]);

  const isVideo = call.type === "video";

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-[#05060a]">
      <audio ref={remoteAudio} autoPlay playsInline className="hidden" />

      {isVideo ? (
        <div className="relative flex-1 overflow-hidden">
          {remoteStream ? (
            <video
              ref={remoteVideo}
              autoPlay
              playsInline
              className="h-full w-full bg-black object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Avatar peer={call.peer} />
            </div>
          )}
          <div className="absolute right-4 top-4 h-40 w-28 overflow-hidden rounded-2xl border border-border bg-black shadow-xl sm:h-48 sm:w-36">
            <video
              ref={localVideo}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-5 pb-10 pt-6 text-center">
            <p className="text-lg font-extrabold">{name}</p>
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
              {stateLabel(state, seconds, name, error)}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <Avatar peer={call.peer} />
          <div>
            <h2 className="text-2xl font-extrabold">{name}</h2>
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {stateLabel(state, seconds, name, error)}
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Peer-to-peer · never recorded
          </p>
        </div>
      )}

      <div className="pt-6">
        <Controls
          type={call.type}
          muted={muted}
          cameraOff={cameraOff}
          onToggleMute={onToggleMute}
          onToggleCamera={onToggleCamera}
          onHangUp={onHangUp}
        />
      </div>
    </div>
  );
}
