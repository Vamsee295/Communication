/** ICE configuration. STUN/TURN come from env so infrastructure is never hard-coded. */
export function getIceServers(): RTCIceServer[] {
  const stunEnv = import.meta.env.VITE_STUN_SERVER_URL;
  const stunUrls = stunEnv 
    ? stunEnv.split(",").map((s: string) => s.trim()).filter(Boolean)
    : [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.cloudflare.com:3478"
      ];

  const servers: RTCIceServer[] = [{ urls: stunUrls }];

  const turnEnv = import.meta.env.VITE_TURN_URL;
  if (turnEnv) {
    const turnUrls = turnEnv.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (turnUrls.length > 0) {
      servers.push({
        urls: turnUrls,
        username: import.meta.env.VITE_TURN_USERNAME ?? "",
        credential: import.meta.env.VITE_TURN_CREDENTIAL ?? "",
      });
    }
  }
  return servers;
}

export function rtcConfig(): RTCConfiguration {
  return { 
    iceServers: getIceServers(), 
    iceCandidatePoolSize: 4 
  };
}

export function isRelayCandidate(candidate: RTCIceCandidate | string): boolean {
  const candStr = typeof candidate === "string" ? candidate : candidate.candidate;
  return candStr.toLowerCase().includes("typ relay");
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
