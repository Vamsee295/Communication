import { describe, it, expect, vi, afterEach } from "vitest";
import { getIceServers, rtcConfig, isRelayCandidate, formatDuration } from "@/lib/webrtc-config";

describe("webrtc-config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getIceServers", () => {
    it("returns default STUN servers when no env is set", () => {
      vi.unstubAllEnvs();
      const servers = getIceServers();
      
      expect(servers.length).toBe(1);
      expect(servers[0].urls).toEqual([
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
      ]);
    });

    it("parses VITE_STUN_SERVER_URL correctly", () => {
      vi.stubEnv("VITE_STUN_SERVER_URL", "stun:custom.stun.com:3478, stun:other.stun.com ");
      const servers = getIceServers();
      expect(servers.length).toBe(1);
      expect(servers[0].urls).toEqual([
        "stun:custom.stun.com:3478",
        "stun:other.stun.com",
      ]);
    });

    it("parses VITE_TURN_URL and credentials", () => {
      vi.stubEnv("VITE_TURN_URL", "turn:turn.my-server.com:3478, turns:turn.my-server.com:5349");
      vi.stubEnv("VITE_TURN_USERNAME", "test_user");
      vi.stubEnv("VITE_TURN_CREDENTIAL", "test_password");
      
      const servers = getIceServers();
      // Should have STUN (default) + TURN
      expect(servers.length).toBe(2);
      expect(servers[1].urls).toEqual([
        "turn:turn.my-server.com:3478",
        "turns:turn.my-server.com:5349",
      ]);
      expect(servers[1].username).toBe("test_user");
      expect(servers[1].credential).toBe("test_password");
    });
  });

  describe("isRelayCandidate", () => {
    it("detects relay candidate from string", () => {
      const cand = "candidate:12345 1 udp 123456 192.168.1.1 3478 typ relay raddr 1.2.3.4 rport 5678";
      expect(isRelayCandidate(cand)).toBe(true);
    });

    it("returns false for srflx or host candidates", () => {
      expect(isRelayCandidate("typ host")).toBe(false);
      expect(isRelayCandidate("typ srflx")).toBe(false);
    });
  });

  describe("formatDuration", () => {
    it("formats under a minute", () => {
      expect(formatDuration(45)).toBe("00:45");
      expect(formatDuration(5)).toBe("00:05");
    });

    it("formats exactly one minute", () => {
      expect(formatDuration(60)).toBe("01:00");
    });

    it("formats minutes and seconds", () => {
      expect(formatDuration(125)).toBe("02:05");
    });

    it("formats over an hour", () => {
      expect(formatDuration(3605)).toBe("1:00:05");
      expect(formatDuration(3665)).toBe("1:01:05");
    });
  });
});
