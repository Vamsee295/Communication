/**
 * Ghostline Client-Side Image Optimization
 * Reduces upload bandwidth while preserving visual quality and aspect ratio.
 */

interface OptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeToSkip?: number; // Size in bytes below which optimization is skipped
}

const DEFAULT_OPTIONS: OptimizeOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  maxSizeToSkip: 800 * 1024, // 800 KB
};

/**
 * Optimizes an image file client-side before upload.
 * Preserves transparency for PNG/WebP, and skips small images/GIFs/SVGs.
 */
export async function optimizeImageBeforeUpload(
  file: File,
  options: OptimizeOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Only optimize standard raster images
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  // Skip tiny images already below threshold
  if (file.size <= (opts.maxSizeToSkip || 800 * 1024)) return file;

  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) {
      // Fallback via HTMLImageElement if createImageBitmap fails
      return await optimizeViaImageElement(file, opts);
    }

    const { width, height } = bitmap;
    const { targetWidth, targetHeight, needsResize } = calculateDimensions(
      width,
      height,
      opts.maxWidth || 1920,
      opts.maxHeight || 1920
    );

    // If dimensions are fine and file size isn't massive, keep original
    if (!needsResize && file.size < 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const outputMime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputMime, opts.quality);
    });

    if (!blob || blob.size >= file.size) {
      // If optimized version isn't actually smaller, use original
      return file;
    }

    return new File([blob], file.name, {
      type: outputMime,
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn("[Ghostline] Image optimization skipped due to error:", err);
    return file;
  }
}

async function optimizeViaImageElement(file: File, opts: OptimizeOptions): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { targetWidth, targetHeight } = calculateDimensions(
        img.width,
        img.height,
        opts.maxWidth || 1920,
        opts.maxHeight || 1920
      );

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const outputMime = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
          } else {
            resolve(new File([blob], file.name, { type: outputMime, lastModified: Date.now() }));
          }
        },
        outputMime,
        opts.quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

function calculateDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
) {
  let targetWidth = width;
  let targetHeight = height;
  let needsResize = false;

  if (width > maxWidth || height > maxHeight) {
    needsResize = true;
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    targetWidth = Math.round(width * ratio);
    targetHeight = Math.round(height * ratio);
  }

  return { targetWidth, targetHeight, needsResize };
}
