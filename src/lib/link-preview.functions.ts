import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  domain: string;
  imageUrl?: string;
  favicon?: string;
}

// In-memory cache for link metadata
const previewCache = new Map<string, { data: LinkMetadata; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export function isPrivateIpOrHostname(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // Only allow http and https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }

    // Localhost / loopback check
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.includes("127.0.0.1") ||
      hostname.startsWith("[") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return true;
    }

    // Private IPv4 ranges
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const [_, o1, o2, o3, o4] = match.map(Number);
      // 10.0.0.0/8
      if (o1 === 10) return true;
      // 172.16.0.0/12
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
      // 192.168.0.0/16
      if (o1 === 192 && o2 === 168) return true;
      // 127.0.0.0/8
      if (o1 === 127) return true;
      // 169.254.0.0/16 (Link-local / AWS metadata)
      if (o1 === 169 && o2 === 254) return true;
      // 0.0.0.0/8
      if (o1 === 0) return true;
    }

    return false;
  } catch {
    return true;
  }
}

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
  const matches = text.match(urlRegex);
  if (!matches) return [];
  // Return unique valid URLs (max 3)
  const unique = Array.from(new Set(matches));
  return unique.filter((u) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }).slice(0, 3);
}

export const getLinkPreview = createServerFn({ method: "GET" })
  .validator(
    z.object({
      url: z.string().url(),
    })
  )
  .handler(async ({ data: { url } }): Promise<LinkMetadata | null> => {
    // 1. Validate URL & SSRF safety
    if (isPrivateIpOrHostname(url)) {
      return null;
    }

    // 2. Check cache
    const cached = previewCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "GhostlineBot/1.0 (+https://ghostline.app)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        return null;
      }

      // Read max 512KB to avoid reading massive responses
      const reader = response.body?.getReader();
      if (!reader) return null;

      let html = "";
      const maxBytes = 512 * 1024;
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        receivedBytes += value.length;
        html += new TextDecoder("utf-8").decode(value, { stream: true });
        if (receivedBytes >= maxBytes || html.includes("</head>")) {
          reader.cancel().catch(() => {});
          break;
        }
      }

      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.replace(/^www\./, "");

      // Extract OpenGraph / Meta tags
      const getMetaTag = (property: string): string | undefined => {
        const regex1 = new RegExp(`<meta[^>]*property=["'](?:og:)?${property}["'][^>]*content=["']([^"']*)["']`, "i");
        const match1 = html.match(regex1);
        if (match1?.[1]) return match1[1].trim();

        const regex2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["'](?:og:)?${property}["']`, "i");
        const match2 = html.match(regex2);
        if (match2?.[1]) return match2[1].trim();

        const regex3 = new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
        const match3 = html.match(regex3);
        if (match3?.[1]) return match3[1].trim();

        return undefined;
      };

      // Extract Title
      let title = getMetaTag("title");
      if (!title) {
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (titleMatch?.[1]) title = titleMatch[1].trim();
      }

      // Extract Description
      const description = getMetaTag("description");

      // Extract Image
      let imageUrl = getMetaTag("image");
      if (imageUrl && !imageUrl.startsWith("http")) {
        try {
          imageUrl = new URL(imageUrl, url).href;
        } catch {
          imageUrl = undefined;
        }
      }

      // Favicon
      let favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

      const result: LinkMetadata = {
        url,
        title: title ? title.slice(0, 120) : undefined,
        description: description ? description.slice(0, 200) : undefined,
        domain,
        imageUrl,
        favicon,
      };

      // Only cache and return if we extracted meaningful metadata
      if (result.title || result.description || result.imageUrl) {
        previewCache.set(url, { data: result, timestamp: Date.now() });
        return result;
      }

      return null;
    } catch {
      return null;
    }
  });
