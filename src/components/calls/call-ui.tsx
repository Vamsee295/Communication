import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Lock } from "lucide-react";
import type { CallPeer, CallType } from "@/lib/calls.functions";
import { formatDuration } from "@/lib/webrtc-config";

function peerName(peer: CallPeer | null) {
  return peer?.display_name ?? peer?.username ?? "Ghost";
}

function Avatar({ peer, size = "lg" }: { peer: CallPeer | null; size?: "lg" | "md" }) {
  const cls = size === "lg" ? "h-28 w-28 text-4xl" : "h-18 w-18 text-2xl";
  const name = peerName(peer);
  if (peer?.avatar_url) {
    return (
      <img
        src={peer.avatar_url}
        alt={name}
        className={`${cls} rounded-full object-cover ring-4 ring-white/80 shadow-md`}
      />
    );
  }
  return (
    <div
      className={`grid ${cls} place-items-center rounded-full bg-gradient-to-br from-[#2587F5] to-[#1467D8] font-black text-white shadow-lg shadow-primary/25 ring-4 ring-white/80`}
    >
      {name.charAt(0).toUpperCase()}
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
    <div 
      className="fixed inset-0 z-[100] grid place-items-center bg-[#0B1B33]/40 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
    >
      <div className="animate-rise-in w-full max-w-sm rounded-[28px] border border-white/80 bg-white/95 p-7 text-center shadow-[0_25px_60px_-15px_rgba(20,103,216,0.2),0_0_0_1px_rgba(220,232,245,0.7)] backdrop-blur-2xl">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          Incoming {type === "video" ? "Video" : "Voice"} Call
        </div>

        {/* Pulsing Avatar */}
        <div className="relative mx-auto my-5 flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-60" />
          <span className="absolute -inset-2 rounded-full bg-primary/10 animate-pulse" />
          <div className="relative">
            <Avatar peer={peer} size="md" />
          </div>
        </div>

        <h2 id="incoming-call-title" className="text-2xl font-extrabold tracking-tight text-[#0B1B33]">
          {peerName(peer)}
        </h2>
        {peer?.username && (
          <p className="mt-0.5 text-[13px] font-medium text-[#64748B]">@{peer.username}</p>
        )}
        <p className="mt-2 text-sm font-semibold text-primary animate-pulse">
          is calling you...
        </p>

        <div className="mt-8 flex items-center justify-center gap-8">
          <button
            onClick={onDecline}
            className="group flex flex-col items-center gap-2 rounded-2xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 cursor-pointer"
            aria-label="Decline call"
          >
            <div className="press grid h-16 w-16 place-items-center rounded-full bg-[#EF4444] text-white shadow-lg shadow-red-500/30 transition-all group-hover:bg-[#DC2626] group-hover:scale-105 active:scale-95">
              <PhoneOff className="h-6 w-6" />
            </div>
            <span className="text-xs font-semibold text-[#64748B] group-hover:text-[#EF4444] transition-colors">
              Decline
            </span>
          </button>

          <button
            onClick={onAccept}
            className="group flex flex-col items-center gap-2 rounded-2xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 cursor-pointer"
            aria-label="Accept call"
          >
            <div className="press grid h-16 w-16 place-items-center rounded-full bg-[#10B981] text-white shadow-lg shadow-emerald-500/30 transition-all group-hover:bg-[#059669] group-hover:scale-105 active:scale-95">
              {type === "video" ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
            </div>
            <span className="text-xs font-semibold text-[#64748B] group-hover:text-[#10B981] transition-colors">
              Accept
            </span>
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

function PermissionHint({ error, isVideo }: { error: string | null; isVideo: boolean }) {
  if (!error) return null;
  const isPermission = /access is required|access your/i.test(error);
  if (!isPermission) return null;
  return (
    <p
      className={[
        "mx-auto mt-4 max-w-xs rounded-2xl px-4 py-3 text-[12px] leading-relaxed",
        isVideo
          ? "border border-white/20 bg-black/70 text-slate-300"
          : "border border-red-200 bg-red-50 text-red-700",
      ].join(" ")}
    >
      {error} Enable microphone/camera in your browser settings and try again.
    </p>
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
  const isVideo = call.type === "video";

  useEffect(() => {
    if (remoteVideo.current && remoteStream) remoteVideo.current.srcObject = remoteStream;
    if (remoteAudio.current && remoteStream) remoteAudio.current.srcObject = remoteStream;
    if (localVideo.current && localStream) localVideo.current.srcObject = localStream;
  }, [remoteStream, localStream]);

  if (isVideo) {
    return (
      <div className="fixed inset-0 z-[95] flex flex-col bg-[#05060A]">
        <audio ref={remoteAudio} autoPlay playsInline className="hidden" />

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
              <Avatar peer={call.peer} size="lg" />
            </div>
          )}

          {/* Local pip */}
          <div className="absolute right-4 top-4 h-40 w-28 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl sm:h-48 sm:w-36">
            <video
              ref={localVideo}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          </div>

          {/* Top header overlay */}
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
            <p className="text-xl font-extrabold text-white">{name}</p>
            {call.peer?.username && (
              <p className="text-xs text-slate-300">@{call.peer.username}</p>
            )}
            <p className="mt-1 text-sm font-semibold tabular-nums text-primary">
              {stateLabel(state, seconds, name, error)}
            </p>
            <PermissionHint error={state === "FAILED" ? error : null} isVideo={true} />
          </div>
        </div>

        {/* Video controls */}
        <div className="flex items-center justify-center gap-6 bg-black/90 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
          <button
            onClick={onToggleMute}
            className={[
              "press grid h-14 w-14 place-items-center rounded-full border transition-all hover:scale-105 active:scale-95",
              muted
                ? "border-red-500 bg-red-500/20 text-red-400"
                : "border-white/20 bg-white/10 text-white hover:bg-white/20",
            ].join(" ")}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
          <button
            onClick={onHangUp}
            className="press grid h-18 w-18 place-items-center rounded-full bg-[#EF4444] text-white shadow-xl shadow-red-500/35 transition-all hover:bg-[#DC2626] hover:scale-105 active:scale-95"
            aria-label="End call"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
          <button
            onClick={onToggleCamera}
            className={[
              "press grid h-14 w-14 place-items-center rounded-full border transition-all hover:scale-105 active:scale-95",
              cameraOff
                ? "border-red-500 bg-red-500/20 text-red-400"
                : "border-white/20 bg-white/10 text-white hover:bg-white/20",
            ].join(" ")}
            aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
          >
            {cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </button>
        </div>
      </div>
    );
  }

  // Voice call: Ghostline Premium Light Aesthetic
  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-gradient-to-b from-[#F0F6FE] via-[#F7FAFE] to-[#EBF3FC]">
      <audio ref={remoteAudio} autoPlay playsInline className="hidden" />

      {/* Top security header */}
      <div className="flex items-center justify-between px-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#DCE8F5] bg-white/85 px-3.5 py-1.5 text-xs font-medium text-[#64748B] shadow-xs backdrop-blur-md">
          <Lock className="h-3.5 w-3.5 text-primary" />
          <span>Ghostline Private Call · E2EE</span>
        </div>
        {state === "CONNECTED" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Center hero */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Pulsing Avatar */}
        <div className="relative mb-6 flex items-center justify-center">
          {(state === "OUTGOING" || state === "CONNECTING") && (
            <>
              <span className="absolute -inset-4 rounded-full bg-primary/10 animate-ping opacity-60" />
              <span className="absolute -inset-2 rounded-full bg-primary/15 animate-pulse" />
            </>
          )}
          <Avatar peer={call.peer} size="lg" />
        </div>

        <h2 className="text-3xl font-black tracking-tight text-[#0B1B33]">
          {name}
        </h2>
        {call.peer?.username && (
          <p className="mt-1 text-sm font-medium text-[#64748B]">@{call.peer.username}</p>
        )}

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#DCE8F5] bg-white px-4 py-1.5 shadow-xs">
          <p className="text-sm font-bold tabular-nums text-primary">
            {stateLabel(state, seconds, name, error)}
          </p>
        </div>

        <PermissionHint error={state === "FAILED" ? error : null} isVideo={false} />
      </div>

      {/* Voice controls dock */}
      <div className="flex items-center justify-center gap-7 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:gap-9">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onToggleMute}
            className={[
              "press grid h-16 w-16 place-items-center rounded-full border shadow-md transition-all hover:scale-105 active:scale-95",
              muted
                ? "border-red-200 bg-red-50 text-red-600 shadow-red-500/10"
                : "border-[#DCE8F5] bg-white text-[#0B1B33] hover:bg-slate-50 shadow-slate-200/50",
            ].join(" ")}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MicOff className="h-6 w-6 text-red-600" /> : <Mic className="h-6 w-6" />}
          </button>
          <span className="text-xs font-semibold text-[#64748B]">
            {muted ? "Unmute" : "Mute"}
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onHangUp}
            className="press grid h-20 w-20 place-items-center rounded-full bg-[#EF4444] text-white shadow-xl shadow-red-500/35 transition-all hover:bg-[#DC2626] hover:scale-105 active:scale-95"
            aria-label="End call"
          >
            <PhoneOff className="h-8 w-8" />
          </button>
          <span className="text-xs font-semibold text-red-600">End</span>
        </div>
      </div>
    </div>
  );
}
