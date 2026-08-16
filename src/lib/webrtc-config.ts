/** ICE configuration. STUN/TURN come from env so infrastructure is never hard-coded. */
export function getIceServers(): RTCIceServer[] {
  const env = import.meta.env as Record<string, string | undefined>;
  const stun = env['VITE_STUN_SERVER_URL'] || "stun:stun.l.google.com:19302";
  const servers: RTCIceServer[] = [{ urls: stun.split(",").map((s) => s.trim()) }];

  const turnUrl = env['VITE_TURN_URL'];
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(",").map((s) => s.trim()),
      username: env['VITE_TURN_USERNAME'] ?? "",
      credential: env['VITE_TURN_CREDENTIAL'] ?? "",
    });
  }
  return servers;
}

export function rtcConfig(): RTCConfiguration {
  return { iceServers: getIceServers(), iceCandidatePoolSize: 4 };
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
