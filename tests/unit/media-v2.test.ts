import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, getFileIcon } from "@/components/chat/attachment-renderer";
import { optimizeImageBeforeUpload } from "@/lib/image-optimizer";

describe("Media V2 — Formatting & Classifications", () => {
  it("formats bytes into human readable sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1024 * 50)).toBe("50 KB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });

  it("formats audio and video durations properly", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(360)).toBe("6:00");
  });

  it("classifies mime types with specialized icons", () => {
    const pdfIcon = getFileIcon("application/pdf");
    const zipIcon = getFileIcon("application/zip");
    const imgIcon = getFileIcon("image/png");
    const videoIcon = getFileIcon("video/mp4");
    const audioIcon = getFileIcon("audio/webm");
    const genericIcon = getFileIcon("text/plain");

    expect(pdfIcon).toBeDefined();
    expect(zipIcon).toBeDefined();
    expect(imgIcon).toBeDefined();
    expect(videoIcon).toBeDefined();
    expect(audioIcon).toBeDefined();
    expect(genericIcon).toBeDefined();
  });
});

describe("Media V2 — Client-Side Image Optimizer", () => {
  it("skips non-image files or small SVGs/GIFs", async () => {
    const textFile = new File(["hello world"], "doc.txt", { type: "text/plain" });
    const res = await optimizeImageBeforeUpload(textFile);
    expect(res).toBe(textFile);

    const gifFile = new File(["fake-gif"], "anim.gif", { type: "image/gif" });
    const gifRes = await optimizeImageBeforeUpload(gifFile);
    expect(gifRes).toBe(gifFile);
  });

  it("skips small images below size threshold", async () => {
    const smallJpg = new File(["small-image-content"], "avatar.jpg", { type: "image/jpeg" });
    const res = await optimizeImageBeforeUpload(smallJpg, { maxSizeToSkip: 50000 });
    expect(res).toBe(smallJpg);
  });
});
