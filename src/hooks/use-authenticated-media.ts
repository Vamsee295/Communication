import { useState, useEffect, useCallback } from "react";
import { getAuthenticatedAttachment } from "@/lib/authenticated-media";

export interface UseAuthenticatedMediaOptions {
  autoFetch?: boolean;
}

export function useAuthenticatedMedia(
  attachmentId: string | undefined | null,
  options: UseAuthenticatedMediaOptions = {}
) {
  const { autoFetch = true } = options;
  const [url, setUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch && Boolean(attachmentId));
  const [error, setError] = useState<string | null>(null);

  const fetchMedia = useCallback(async () => {
    if (!attachmentId) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const media = await getAuthenticatedAttachment(attachmentId);
      setUrl(media.objectUrl);
      setContentType(media.contentType);
      setLoading(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load media";
      setError(message);
      setLoading(false);
    }
  }, [attachmentId]);

  useEffect(() => {
    if (autoFetch && attachmentId) {
      void fetchMedia();
    }
  }, [autoFetch, attachmentId, fetchMedia]);

  return {
    url,
    contentType,
    loading,
    error,
    retry: fetchMedia,
    fetchMedia,
  };
}
