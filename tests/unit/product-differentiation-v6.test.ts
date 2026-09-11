import { describe, it, expect, vi } from "vitest";
import { extractUrls } from "@/lib/link-preview.functions";
import {
  GHOSTLINE_STICKER_PACKS,
  formatStickerPayload,
  parseStickerMessage,
} from "@/lib/stickers";
import {
  CURATED_GIFS,
  formatGifPayload,
  parseGifMessage,
} from "@/components/chat/gif-picker";
import {
  formatContactPayload,
  parseContactMessage,
} from "@/components/chat/contact-picker-modal";
import {
  formatLocationPayload,
  parseLocationMessage,
} from "@/components/chat/location-picker-modal";
import {
  CHAT_THEMES,
  CHAT_WALLPAPERS,
  getConversationAppearance,
  saveConversationAppearance,
} from "@/lib/chat-themes";

describe("Ghostline V6 Product Differentiation & Advanced Communication Experience", () => {
  describe("Link Previews & SSRF Safety", () => {
    it("extractUrls finds and extracts valid HTTP/HTTPS URLs from text", () => {
      const text = "Check this out https://ghostline.app and also http://example.com/demo for details!";
      const urls = extractUrls(text);
      expect(urls).toHaveLength(2);
      expect(urls[0]).toBe("https://ghostline.app");
      expect(urls[1]).toBe("http://example.com/demo");
    });

    it("extractUrls ignores invalid formats and caps at 3 unique links", () => {
      const text = "Links: https://one.com https://two.com https://three.com https://four.com not-a-link";
      const urls = extractUrls(text);
      expect(urls).toHaveLength(3);
      expect(urls).toEqual(["https://one.com", "https://two.com", "https://three.com"]);
    });
  });

  describe("Sticker System", () => {
    it("validates curated sticker packs exist with valid vectors and metadata", () => {
      expect(GHOSTLINE_STICKER_PACKS.length).toBeGreaterThanOrEqual(2);
      const pack = GHOSTLINE_STICKER_PACKS[0];
      expect(pack.id).toBe("ghostly");
      expect(pack.stickers.length).toBeGreaterThan(0);
      expect(pack.stickers[0].url).toContain("data:image/svg+xml");
    });

    it("formats and parses sticker payload correctly", () => {
      const sticker = GHOSTLINE_STICKER_PACKS[0].stickers[0];
      const payload = formatStickerPayload(sticker);
      expect(payload).toBe(`ghostline:sticker:${sticker.packId}:${sticker.id}:${sticker.name}`);

      const parsed = parseStickerMessage(payload);
      expect(parsed).toBeDefined();
      expect(parsed?.id).toBe(sticker.id);
      expect(parsed?.packId).toBe(sticker.packId);
    });

    it("returns null for non-sticker messages", () => {
      expect(parseStickerMessage("Hello world")).toBeNull();
      expect(parseStickerMessage("ghostline:invalid:foo")).toBeNull();
    });
  });

  describe("GIF System", () => {
    it("formats and parses GIF message payloads correctly", () => {
      const gif = CURATED_GIFS[0];
      const payload = formatGifPayload(gif);
      expect(payload).toBe(`ghostline:gif:${gif.url}:${gif.title}`);

      const parsed = parseGifMessage(payload);
      expect(parsed).toBeDefined();
      expect(parsed?.url).toBe(gif.url);
      expect(parsed?.title).toBe(gif.title);
    });
  });

  describe("Contact & Location Sharing", () => {
    it("formats and parses contact cards without leaking private info", () => {
      const contact = {
        userId: "11111111-1111-1111-1111-111111111111",
        displayName: "Alice Vance",
        username: "alice",
      };

      const payload = formatContactPayload(contact);
      expect(payload).toBe(`ghostline:contact:${contact.userId}:${contact.displayName}:${contact.username}`);

      const parsed = parseContactMessage(payload);
      expect(parsed).toEqual(contact);
    });

    it("formats and parses location sharing messages with coordinates and optional label", () => {
      const loc = {
        latitude: 37.7749,
        longitude: -122.4194,
        label: "Market Street Office",
      };

      const payload = formatLocationPayload(loc);
      expect(payload).toBe(`ghostline:location:${loc.latitude}:${loc.longitude}:${loc.label}`);

      const parsed = parseLocationMessage(payload);
      expect(parsed).toBeDefined();
      expect(parsed?.latitude).toBeCloseTo(37.7749);
      expect(parsed?.longitude).toBeCloseTo(-122.4194);
      expect(parsed?.label).toBe("Market Street Office");
    });
  });

  describe("Chat Themes & Wallpapers", () => {
    it("defines consistent colorways and wallpapers", () => {
      expect(CHAT_THEMES.default).toBeDefined();
      expect(CHAT_THEMES.midnight).toBeDefined();
      expect(CHAT_THEMES.ocean).toBeDefined();
      expect(CHAT_THEMES.lavender).toBeDefined();

      expect(CHAT_WALLPAPERS.plain).toBeDefined();
      expect(CHAT_WALLPAPERS.dots).toBeDefined();
      expect(CHAT_WALLPAPERS.grid).toBeDefined();
    });

    it("saves and retrieves appearance settings per conversation", () => {
      const convId = "test-theme-conv-123";
      const settings = {
        themeId: "ocean" as const,
        wallpaperId: "dots" as const,
        wallpaperOpacity: 0.1,
      };

      saveConversationAppearance(convId, settings);
      const retrieved = getConversationAppearance(convId);
      expect(retrieved.themeId).toBe("ocean");
      expect(retrieved.wallpaperId).toBe("dots");
      expect(retrieved.wallpaperOpacity).toBe(0.1);
    });
  });
});
