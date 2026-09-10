import { authService } from "@/lib/auth/session";

interface CachedMedia {
  objectUrl: string;
  blob: Blob;
  contentType: string;
}

// In-memory cache for active session to prevent refetching large attachments on re-renders
const mediaCache = new Map<string, CachedMedia>();
const inFlightRequests = new Map<string, Promise<CachedMedia>>();

/**
 * Fetch an attachment with Supabase authentication header and convert to an Object URL.
 */
export async function getAuthenticatedAttachment(attachmentId: string): Promise<CachedMedia> {
  const cached = mediaCache.get(attachmentId);
  if (cached) {
    return cached;
  }

  const existingRequest = inFlightRequests.get(attachmentId);
  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise = (async (): Promise<CachedMedia> => {
    try {
      const { data } = await authService.getSession();
      const token = data?.session?.access_token;

      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/attachments/${attachmentId}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to load attachment (${response.status} ${response.statusText})`);
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const result: CachedMedia = { objectUrl, blob, contentType };
      mediaCache.set(attachmentId, result);
      return result;
    } finally {
      inFlightRequests.delete(attachmentId);
    }
  })();

  inFlightRequests.set(attachmentId, requestPromise);
  return requestPromise;
}

/**
 * Trigger an authenticated download of an attachment.
 */
export async function downloadAuthenticatedAttachment(
  attachmentId: string,
  filename: string,
): Promise<void> {
  const media = await getAuthenticatedAttachment(attachmentId);
  
  const link = document.createElement("a");
  link.href = media.objectUrl;
  link.download = filename || "attachment";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Copy an authenticated image attachment to the system clipboard as a Blob.
 */
export async function copyImageToClipboard(attachmentId: string): Promise<boolean> {
  const media = await getAuthenticatedAttachment(attachmentId);
  if (!navigator.clipboard?.write) {
    throw new Error("Clipboard API not supported");
  }

  // Convert to PNG blob if needed or use native blob
  let blobToWrite = media.blob;
  if (!blobToWrite.type.startsWith("image/png")) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = media.objectUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const pngBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (pngBlob) blobToWrite = pngBlob;
      }
    } catch {
      // Fallback to original blob
    }
  }

  await navigator.clipboard.write([
    new ClipboardItem({ [blobToWrite.type]: blobToWrite }),
  ]);
  return true;
}

