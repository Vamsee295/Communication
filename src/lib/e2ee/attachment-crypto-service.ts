/**
 * E2EE-4 Encrypted Attachment Crypto Service
 *
 * Provides Web Crypto AES-256-GCM client-side encryption and decryption
 * for small (<= 10MB) and large (> 10MB) files using 5MB HKDF-derived chunk nonces.
 *
 * Absolute security rules enforced:
 * - Fresh random 256-bit attachment key per file
 * - Fresh random 96-bit base IV per file
 * - Web Crypto AES-256-GCM authentication tag verification
 * - Deterministic HKDF chunk nonce derivation (same attachment + chunk -> unique nonce)
 * - Plaintext SHA-256 integrity verification (fail-closed on mismatch)
 * - Best-effort memory lifecycle cleanup
 */

export const E2EE4_CHUNK_SIZE = 5 * 1024 * 1024; // 5,242,880 bytes
export const E2EE4_LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10,485,760 bytes

export interface EncryptedChunk {
  chunkIndex: number;
  ciphertext: Uint8Array; // Includes 16-byte AES-GCM authentication tag
}

export interface E2EEAttachmentEnvelope {
  attachment_id: string;
  original_filename: string;
  mime_type: string;
  plaintext_size_bytes: number;
  sha256_plaintext_hex: string;
  base_nonce_hex: string;
  chunk_count: number;
  chunk_size_bytes: number;
  storage_key: string;
  attachment_key_hex: string; // 256-bit key in hex (transmitted ONLY via E2EE message)
  preview_base64?: string;
}

export interface EncryptedAttachmentResult {
  envelope: E2EEAttachmentEnvelope;
  chunks: EncryptedChunk[];
  storageKey: string;
}

/**
 * Safely converts a Uint8Array view into a pure standalone ArrayBuffer
 * to satisfy Web Crypto API type signatures under strict TypeScript.
 */
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(arr.byteLength);
  new Uint8Array(buf).set(arr);
  return buf;
}

/**
 * Best-effort zeroization of sensitive typed arrays.
 * Note: JavaScript runtimes cannot guarantee physical memory zeroization,
 * but this performs best-effort RAM lifecycle cleanup.
 */
export function zeroizeBuffer(buffer: Uint8Array): void {
  buffer.fill(0);
}

export function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBuffer(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives a unique 96-bit (12-byte) IV for a specific chunk index using HKDF.
 * Inputs:
 * - IKM: 256-bit raw attachment key
 * - Salt: 96-bit base IV
 * - Info: "ghostline-e2ee4-chunk-iv-" + chunkIndex
 */
export async function deriveChunkIV(
  attachmentKeyBytes: Uint8Array,
  baseNonceBytes: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(attachmentKeyBytes),
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );
  const info = new TextEncoder().encode("ghostline-e2ee4-chunk-iv-" + chunkIndex);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(baseNonceBytes),
      info: toArrayBuffer(info),
    },
    hkdfKey,
    96 // 96 bits = 12 bytes
  );
  return new Uint8Array(derivedBits);
}

export async function computeSha256Hex(data: Uint8Array): Promise<string> {
  const digestBuffer = await crypto.subtle.digest(
    "SHA-256",
    toArrayBuffer(data)
  );
  return bufferToHex(new Uint8Array(digestBuffer));
}

export class AttachmentCryptoService {
  /**
   * Encrypts a plaintext file buffer using AES-256-GCM.
   * Handles both small files (<=10MB single chunk) and large files (>10MB multi-chunk with HKDF nonces).
   */
  async encryptFile(input: {
    plaintext: Uint8Array;
    filename: string;
    mimeType: string;
    attachmentId?: string;
    previewBase64?: string;
  }): Promise<EncryptedAttachmentResult> {
    const attachmentId = input.attachmentId ?? crypto.randomUUID();
    // Opaque R2 storage path (no conversation_id or filename leakage)
    const storageKey = "attachments/e2ee/" + attachmentId + ".bin";

    // Generate fresh 256-bit attachment key and 96-bit base IV
    const attachmentKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const baseNonceBytes = crypto.getRandomValues(new Uint8Array(12));

    // Calculate plaintext SHA-256 digest
    const sha256PlaintextHex = await computeSha256Hex(input.plaintext);

    const aesKey = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(attachmentKeyBytes),
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    const plaintextSize = input.plaintext.length;
    const isLargeFile = plaintextSize > E2EE4_LARGE_FILE_THRESHOLD;
    const chunkSize = isLargeFile ? E2EE4_CHUNK_SIZE : plaintextSize;

    const chunks: EncryptedChunk[] = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < plaintextSize || (plaintextSize === 0 && chunkIndex === 0)) {
      const end = Math.min(offset + chunkSize, plaintextSize);
      const chunkBytes = input.plaintext.subarray(offset, end);

      const chunkIV = isLargeFile
        ? await deriveChunkIV(attachmentKeyBytes, baseNonceBytes, chunkIndex)
        : baseNonceBytes;

      const ciphertextBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: toArrayBuffer(chunkIV) },
        aesKey,
        toArrayBuffer(chunkBytes)
      );

      chunks.push({
        chunkIndex,
        ciphertext: new Uint8Array(ciphertextBuffer),
      });

      offset += chunkSize;
      chunkIndex++;
      if (plaintextSize === 0) break;
    }

    const envelope: E2EEAttachmentEnvelope = {
      attachment_id: attachmentId,
      original_filename: input.filename,
      mime_type: input.mimeType,
      plaintext_size_bytes: plaintextSize,
      sha256_plaintext_hex: sha256PlaintextHex,
      base_nonce_hex: bufferToHex(baseNonceBytes),
      chunk_count: chunks.length,
      chunk_size_bytes: chunkSize,
      storage_key: storageKey,
      attachment_key_hex: bufferToHex(attachmentKeyBytes),
      preview_base64: input.previewBase64,
    };

    // Best-effort RAM lifecycle cleanup
    zeroizeBuffer(attachmentKeyBytes);

    return {
      envelope,
      chunks,
      storageKey,
    };
  }

  /**
   * Decrypts encrypted file chunks using AES-256-GCM.
   * Verifies per-chunk authentication tags and whole-file SHA-256 integrity.
   * Fails closed if any authentication tag or plaintext digest check fails.
   */
  async decryptFile(
    envelope: E2EEAttachmentEnvelope,
    chunks: EncryptedChunk[]
  ): Promise<Uint8Array> {
    if (!envelope.attachment_key_hex) {
      throw new Error("Missing attachment key for decryption");
    }

    if (chunks.length !== envelope.chunk_count) {
      throw new Error(
        "Chunk count mismatch: expected " + envelope.chunk_count + ", received " + chunks.length
      );
    }

    const attachmentKeyBytes = hexToBuffer(envelope.attachment_key_hex);
    const baseNonceBytes = hexToBuffer(envelope.base_nonce_hex);

    const aesKey = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(attachmentKeyBytes),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const isLargeFile = envelope.plaintext_size_bytes > E2EE4_LARGE_FILE_THRESHOLD;
    const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Verify sequential chunk order
    for (let i = 0; i < sortedChunks.length; i++) {
      if (sortedChunks[i].chunkIndex !== i) {
        throw new Error("Invalid or out-of-order chunk index " + sortedChunks[i].chunkIndex + " at position " + i);
      }
    }

    const decryptedBuffers: Uint8Array[] = [];
    let totalLength = 0;

    for (let i = 0; i < sortedChunks.length; i++) {
      const chunk = sortedChunks[i];
      const chunkIV = isLargeFile
        ? await deriveChunkIV(attachmentKeyBytes, baseNonceBytes, chunk.chunkIndex)
        : baseNonceBytes;

      try {
        const decryptedBuffer = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: toArrayBuffer(chunkIV) },
          aesKey,
          toArrayBuffer(chunk.ciphertext)
        );
        const decryptedChunk = new Uint8Array(decryptedBuffer);
        decryptedBuffers.push(decryptedChunk);
        totalLength += decryptedChunk.length;
      } catch {
        // Zeroize key on failure
        zeroizeBuffer(attachmentKeyBytes);
        throw new Error("AES-GCM decryption failed for chunk " + chunk.chunkIndex);
      }
    }

    // Reassemble full plaintext
    const plaintext = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of decryptedBuffers) {
      plaintext.set(buf, offset);
      offset += buf.length;
    }

    // Verify whole-file SHA-256 integrity digest (FAIL CLOSED)
    const computedSha256 = await computeSha256Hex(plaintext);
    if (computedSha256 !== envelope.sha256_plaintext_hex) {
      zeroizeBuffer(attachmentKeyBytes);
      zeroizeBuffer(plaintext);
      throw new Error(
        "Plaintext integrity mismatch! Expected SHA-256 " + envelope.sha256_plaintext_hex + ", got " + computedSha256
      );
    }

    // Best-effort RAM lifecycle cleanup
    zeroizeBuffer(attachmentKeyBytes);

    return plaintext;
  }
}

export const attachmentCryptoService = new AttachmentCryptoService();
