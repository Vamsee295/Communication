import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Globe } from "lucide-react";
import { getLinkPreview, type LinkMetadata } from "@/lib/link-preview.functions";

interface LinkPreviewCardProps {
  url: string;
  mine?: boolean;
}

export const LinkPreviewCard = memo(function LinkPreviewCard({ url, mine = false }: LinkPreviewCardProps) {
  const fetchPreview = useServerFn(getLinkPreview);

  const { data: preview, isLoading, isError } = useQuery({
    queryKey: ["link-preview", url],
    queryFn: () => fetchPreview({ data: { url } }),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: false,
  });

  if (isLoading || isError || !preview || (!preview.title && !preview.description && !preview.imageUrl)) {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={[
        "group mt-2 block overflow-hidden rounded-xl border text-left transition hover:opacity-95 active:scale-[0.99]",
        mine
          ? "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground"
          : "border-border/60 bg-surface-2/80 text-foreground",
      ].join(" ")}
    >
      {preview.imageUrl && (
        <div className="relative aspect-[1.91/1] max-h-40 w-full overflow-hidden bg-muted/40">
          <img
            src={preview.imageUrl}
            alt={preview.title || "Preview image"}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            onError={(e) => {
              // Hide broken images
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] opacity-75">
          {preview.favicon ? (
            <img src={preview.favicon} alt="" className="h-3 w-3 shrink-0 rounded-sm" />
          ) : (
            <Globe className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate font-medium uppercase tracking-wider">{preview.domain}</span>
          <ExternalLink className="ml-auto h-2.5 w-2.5 shrink-0 opacity-60" />
        </div>

        {preview.title && (
          <h4 className="mt-1 line-clamp-1 text-xs font-semibold leading-tight">
            {preview.title}
          </h4>
        )}

        {preview.description && (
          <p className="mt-0.5 line-clamp-2 text-[11px] opacity-80 leading-snug">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
});
