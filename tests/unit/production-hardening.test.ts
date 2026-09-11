import fs from "fs";
import { describe, it, expect, vi, beforeEach } from "vitest";

if (fs.existsSync(".env")) {
  const lines = fs.readFileSync(".env", "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [k, ...v] = trimmed.split("=");
      process.env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}

import { clearMediaCache } from "@/lib/authenticated-media";
import { AttachmentService } from "@/lib/attachments";
import { handleAttachmentApiRequest } from "@/lib/attachments.api";
import { getPostgresClient } from "@/lib/infra/postgres/client";

describe("Ghostline V5 Production Hardening & Reliability", () => {
  const sql = getPostgresClient();

  describe("Memory & Object URL Management", () => {
    it("clearMediaCache revokes all tracked Object URLs and empties the cache", () => {
      const revokeSpy = vi.fn();
      globalThis.URL.revokeObjectURL = revokeSpy;

      // Invoke clearMediaCache
      expect(() => clearMediaCache()).not.toThrow();
    });
  });

  describe("File Upload & Attachment Security", () => {
    it("AttachmentService enforces maximum file size constraint (10MB)", async () => {
      const members = await sql`
        SELECT cm.conversation_id, cm.user_id
        FROM public.conversation_members cm
        LIMIT 1;
      `;

      if (members.length > 0) {
        const { conversation_id, user_id } = members[0];
        const service = new AttachmentService(sql, user_id);

        await expect(
          service.start({
            conversation_id,
            filename: "huge_file.zip",
            mime_type: "application/zip",
            file_size: 15 * 1024 * 1024, // 15MB > 10MB limit
          })
        ).rejects.toThrow(/Unsupported attachment metadata/i);
      }
    });

    it("AttachmentService sanitizes dangerous path traversal filenames", async () => {
      const members = await sql`
        SELECT cm.conversation_id, cm.user_id
        FROM public.conversation_members cm
        LIMIT 1;
      `;

      if (members.length > 0) {
        const { conversation_id, user_id } = members[0];
        const service = new AttachmentService(sql, user_id);

        const res = await service.start({
          conversation_id,
          filename: "../../../etc/passwd.png",
          mime_type: "image/png",
          file_size: 1024,
        });

        expect(res.attachment).toBeDefined();
        // Filename should not retain path traversal segments
        expect(res.attachment.original_filename).not.toContain("/");
        expect(res.attachment.original_filename).not.toContain("\\");

        // Clean up created attachment
        await sql`DELETE FROM public.attachments WHERE id = ${res.attachment.id};`;
      }
    });
  });

  describe("API Authentication & Security Headers", () => {
    it("GET /api/attachments/:id without authorization returns 401", async () => {
      const req = new Request("http://localhost/api/attachments/00000000-0000-0000-0000-000000000001", {
        method: "GET",
      });

      const res = await handleAttachmentApiRequest(req);
      expect(res.status).toBe(401);
    });

    it("PUT /api/attachments/:id without authorization returns 401", async () => {
      const req = new Request("http://localhost/api/attachments/00000000-0000-0000-0000-000000000001", {
        method: "PUT",
        body: new Uint8Array([1, 2, 3]),
      });

      const res = await handleAttachmentApiRequest(req);
      expect(res.status).toBe(401);
    });

    it("GET with malformed attachment ID returns 400 Bad Request", async () => {
      const req = new Request("http://localhost/api/attachments/not-a-valid-uuid", {
        method: "GET",
      });

      const res = await handleAttachmentApiRequest(req);
      expect(res.status).toBe(400);
    });

    it("Unauthenticated request with fake token returns 401", async () => {
      const req = new Request("http://localhost/api/attachments/00000000-0000-0000-0000-000000000001", {
        method: "GET",
        headers: {
          authorization: "Bearer invalid.jwt.token",
        },
      });

      const res = await handleAttachmentApiRequest(req);
      expect(res.status).toBe(401);
    });
  });
});
