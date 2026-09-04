import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Attachment, Message } from "@/lib/domain/types";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/domain/errors";
import type { DbClient } from "@/lib/infra/postgres/client";

const TYPES = new Map([
  ["image/jpeg", ["jpg", "jpeg"]], ["image/png", ["png"]], ["image/webp", ["webp"]],
  ["image/gif", ["gif"]], ["application/pdf", ["pdf"]], ["text/plain", ["txt"]],
]);
const MAX_NAME = 160;
const expirySeconds = 300;
type Stored = Attachment & { storage_key: string };

function config() {
  const account = process.env.R2_ACCOUNT_ID, key = process.env.R2_ACCESS_KEY_ID, secret = process.env.R2_SECRET_ACCESS_KEY;
  if (!account || !key || !secret) throw new Error("R2 attachment signing is not configured");
  return { account, key, secret, max: Number(process.env.MAX_ATTACHMENT_SIZE_BYTES ?? 10 * 1024 * 1024) };
}
function safeFileName(name: string) {
  const value = name.normalize("NFKC").replace(/[\\/<>:"|?*]/g, "_").trim();
  if (!value || value.length > MAX_NAME || value === "." || value === ".." || [...value].some((char) => char.charCodeAt(0) < 32)) throw new ValidationError("Invalid attachment filename");
  return value;
}
function validate(name: string, type: string, size: number) {
  const n = safeFileName(name), exts = TYPES.get(type);
  if (!exts || !Number.isSafeInteger(size) || size < 1 || size > config().max) throw new ValidationError("Unsupported attachment metadata");
  const ext = n.split(".").pop()?.toLowerCase();
  if (!ext || !exts.includes(ext)) throw new ValidationError("Filename extension does not match file type");
  return n;
}
function hash(key: string | Uint8Array, data: string) { return createHmac("sha256", key as string).update(data, "utf8").digest(); }
function signUrl(method: "GET" | "PUT" | "DELETE" | "HEAD", objectKey: string, contentType?: string) {
  const c = config(), host = `${c.account}.r2.cloudflarestorage.com`, now = new Date();
  const stamp = now.toISOString().replace(/[-:]|\.\d{3}/g, ""); const date = stamp.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`, uri = `/ghostline-attachments-prod/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const query = new URLSearchParams({ "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${c.key}/${scope}`, "X-Amz-Date": stamp, "X-Amz-Expires": String(expirySeconds), "X-Amz-SignedHeaders": contentType ? "content-type;host" : "host" });
  const headers = contentType ? `content-type:${contentType}\nhost:${host}\n` : `host:${host}\n`;
  const canonical = `${method}\n${uri}\n${query.toString().replace(/%2F/g, "%2F")}\n${headers}\n${contentType ? "content-type;host" : "host"}\nUNSIGNED-PAYLOAD`;
  const string = `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${createHash("sha256").update(canonical).digest("hex")}`;
  const kDate = hash(`AWS4${c.secret}`, date), kRegion = hash(kDate, "auto"), kService = hash(kRegion, "s3"), kSigning = hash(kService, "aws4_request");
  query.set("X-Amz-Signature", createHmac("sha256", kSigning).update(string).digest("hex"));
  return `https://${host}${uri}?${query.toString()}`;
}

export class AttachmentService {
  constructor(private readonly db: DbClient, private readonly userId: string) {}
  private async member(conversationId: string) {
    const rows = await this.db<{ ok: boolean }[]>`SELECT true AS ok FROM public.conversation_members WHERE conversation_id=${conversationId} AND user_id=${this.userId}`;
    if (!rows[0]) throw new AuthorizationError("You do not belong to this conversation");
  }
  async start(input: { conversation_id: string; filename: string; mime_type: string; file_size: number }) {
    await this.member(input.conversation_id); const filename = validate(input.filename, input.mime_type, input.file_size);
    const id = randomUUID(), storageKey = `attachments/${input.conversation_id}/${id}/${filename.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const rows = await this.db<Stored[]>`INSERT INTO public.attachments (id,conversation_id,uploader_id,storage_key,original_filename,mime_type,file_size) VALUES (${id},${input.conversation_id},${this.userId},${storageKey},${filename},${input.mime_type},${input.file_size}) RETURNING id,conversation_id,uploader_id,message_id,storage_key,original_filename,mime_type,file_size,status,created_at::text`;
    return { attachment: this.public(rows[0]), upload_url: signUrl("PUT", storageKey, input.mime_type), expires_in: expirySeconds };
  }
  async confirm(id: string) {
    const a = await this.ownPending(id);
    const response = await fetch(signUrl("HEAD", a.storage_key), { method: "HEAD" });
    if (!response.ok || Number(response.headers.get("content-length")) !== a.file_size || response.headers.get("content-type")?.split(";")[0] !== a.mime_type) {
      await this.db`UPDATE public.attachments SET status='failed' WHERE id=${a.id}`;
      throw new ValidationError("Uploaded object did not match its approved metadata");
    }
    await this.db`UPDATE public.attachments SET status='uploaded' WHERE id=${a.id}`; return { ok: true as const };
  }
  async access(id: string) { const a = await this.get(id); await this.member(a.conversation_id); if (a.status !== "attached") throw new NotFoundError("Attachment not available"); return { url: signUrl("GET", a.storage_key), expires_in: expirySeconds }; }
  async forMessages(messageIds: string[]): Promise<Record<string, Attachment[]>> {
    if (!messageIds.length) return {};
    const rows = await this.db<Stored[]>`SELECT id,conversation_id,uploader_id,message_id,storage_key,original_filename,mime_type,file_size,status,created_at::text FROM public.attachments WHERE message_id = ANY(${messageIds}) AND status='attached' ORDER BY created_at ASC`;
    return rows.map(this.public).reduce<Record<string, Attachment[]>>((grouped, attachment) => {
      const key = attachment.message_id!; (grouped[key] ??= []).push(attachment); return grouped;
    }, {});
  }
  async cleanupForMessage(messageId: string) {
    const rows = await this.db<Stored[]>`SELECT id,conversation_id,uploader_id,message_id,storage_key,original_filename,mime_type,file_size,status,created_at::text FROM public.attachments WHERE message_id=${messageId}`;
    // R2 failures intentionally do not block the existing hard-delete behavior. Keys are logged
    // for manual/batch cleanup rather than retaining a message the user deleted.
    await Promise.all(rows.map(async (attachment) => {
      try { await fetch(signUrl("DELETE", attachment.storage_key), { method: "DELETE" }); }
      catch { console.error("[ATTACHMENT_CLEANUP_FAILED]", attachment.id); }
    }));
  }
  async send(input: { conversation_id: string; body: string; attachment_ids: string[]; client_id?: string }) : Promise<Message> {
    await this.member(input.conversation_id);
    if (!input.body.trim() && !input.attachment_ids.length) throw new ValidationError("A message needs text or an attachment");
    if (input.attachment_ids.length > 10 || new Set(input.attachment_ids).size !== input.attachment_ids.length) throw new ValidationError("Invalid attachments");
    const items = await this.db<Stored[]>`SELECT id,conversation_id,uploader_id,message_id,storage_key,original_filename,mime_type,file_size,status,created_at::text FROM public.attachments WHERE id = ANY(${input.attachment_ids})`;
    if (items.length !== input.attachment_ids.length || items.some(a => a.uploader_id !== this.userId || a.conversation_id !== input.conversation_id || a.status !== "uploaded")) throw new AuthorizationError("Attachment cannot be sent");
    const rows = await this.db<Message[]>`INSERT INTO public.messages (conversation_id,sender_id,body,client_id) VALUES (${input.conversation_id},${this.userId},${input.body.trim()},${input.client_id ?? null}) RETURNING id,conversation_id,sender_id,body,client_id,created_at::text,edited_at::text,deleted_at::text,reply_to_id,forwarded_from_id`;
    await this.db`UPDATE public.attachments SET message_id=${rows[0].id},status='attached' WHERE id = ANY(${input.attachment_ids})`;
    return { ...rows[0], attachments: items.map(this.public) };
  }
  private async ownPending(id: string) { const a = await this.get(id); if (a.uploader_id !== this.userId || a.status !== "pending") throw new AuthorizationError("Attachment cannot be confirmed"); return a; }
  private async get(id: string) { const rows = await this.db<Stored[]>`SELECT id,conversation_id,uploader_id,message_id,storage_key,original_filename,mime_type,file_size,status,created_at::text FROM public.attachments WHERE id=${id}`; if (!rows[0]) throw new NotFoundError("Attachment not found"); return rows[0]; }
  private public = ({ storage_key: _key, ...attachment }: Stored): Attachment => attachment;
}
