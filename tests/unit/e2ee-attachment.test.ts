// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  attachmentCryptoService,
  deriveChunkIV,
  computeSha256Hex,
  zeroizeBuffer,
  bufferToHex,
  hexToBuffer,
  E2EE4_LARGE_FILE_THRESHOLD,
  E2EE4_CHUNK_SIZE,
  type E2EEAttachmentEnvelope,
  type EncryptedChunk,
} from "../../src/lib/e2ee/attachment-crypto-service";

describe("E2EE-4 Attachment Cryptographic Engine", () => {
  const SECRET_KEYWORD = "GHOSTLINE_E2EE_ATTACHMENT_SECRET_2026";

  it("small file (<= 10MB): encrypts and decrypts correctly with AES-256-GCM", async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const plaintextBytes = encoder.encode(
      "Top secret document content: " + SECRET_KEYWORD
    );

    const result = await attachmentCryptoService.encryptFile({
      plaintext: plaintextBytes,
      filename: "secret_plan.pdf",
      mimeType: "application/pdf",
    });

    expect(result.envelope.chunk_count).toBe(1);
    expect(result.envelope.original_filename).toBe("secret_plan.pdf");
    expect(result.envelope.mime_type).toBe("application/pdf");
    expect(result.envelope.storage_key).toMatch(/^attachments\/e2ee\/[a-f0-9-]+\.bin$/);

    // Decrypt
    const decryptedBytes = await attachmentCryptoService.decryptFile(
      result.envelope,
      result.chunks
    );
    const decryptedText = decoder.decode(decryptedBytes);

    expect(decryptedText).toBe("Top secret document content: " + SECRET_KEYWORD);
  });

  it("large file (> 10MB): encrypts into 5MB chunks with HKDF-derived nonces", async () => {
    // Generate 11MB pseudo-data (> 10MB threshold)
    const largeSize = 11 * 1024 * 1024;
    const largePlaintext = new Uint8Array(largeSize);
    for (let i = 0; i < largeSize; i += 1000) {
      largePlaintext[i] = i % 256;
    }

    // Embed secret keyword in large file
    const secretTag = new TextEncoder().encode(SECRET_KEYWORD);
    largePlaintext.set(secretTag, 5000);

    const result = await attachmentCryptoService.encryptFile({
      plaintext: largePlaintext,
      filename: "video_dump.mp4",
      mimeType: "video/mp4",
    });

    // 11MB / 5MB = 3 chunks (5MB, 5MB, 1MB)
    expect(result.envelope.chunk_count).toBe(3);
    expect(result.envelope.chunk_size_bytes).toBe(E2EE4_CHUNK_SIZE);
    expect(result.chunks.length).toBe(3);

    // Decrypt large file
    const decryptedLarge = await attachmentCryptoService.decryptFile(
      result.envelope,
      result.chunks
    );

    expect(decryptedLarge.length).toBe(largeSize);
    expect(decryptedLarge[5000]).toBe(secretTag[0]);
    
    const expectedSha256 = await computeSha256Hex(largePlaintext);
    const actualSha256 = await computeSha256Hex(decryptedLarge);
    expect(actualSha256).toBe(expectedSha256);
  });

  it("HKDF chunk IV derivation guarantees uniqueness and scoping", async () => {
    const key1 = crypto.getRandomValues(new Uint8Array(32));
    const key2 = crypto.getRandomValues(new Uint8Array(32));
    const baseNonce = crypto.getRandomValues(new Uint8Array(12));

    const ivChunk0 = await deriveChunkIV(key1, baseNonce, 0);
    const ivChunk1 = await deriveChunkIV(key1, baseNonce, 1);
    const ivChunk0Key2 = await deriveChunkIV(key2, baseNonce, 0);
    const ivChunk0SameKey = await deriveChunkIV(key1, baseNonce, 0);

    expect(ivChunk0.length).toBe(12);
    expect(ivChunk1.length).toBe(12);

    // Same key + baseNonce + chunkIndex -> deterministic IV
    expect(bufferToHex(ivChunk0)).toBe(bufferToHex(ivChunk0SameKey));

    // Different chunk index under same key -> different IV
    expect(bufferToHex(ivChunk0)).not.toBe(bufferToHex(ivChunk1));

    // Different key under same chunk index -> different IV
    expect(bufferToHex(ivChunk0)).not.toBe(bufferToHex(ivChunk0Key2));
  });

  it("server blindness test: secret keyword 0% present in ciphertext or storage path", async () => {
    const plaintext = new TextEncoder().encode(
      "CLASSIFIED PAYLOAD: " + SECRET_KEYWORD
    );

    const result = await attachmentCryptoService.encryptFile({
      plaintext,
      filename: "classified.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const ciphertextHex = bufferToHex(result.chunks[0].ciphertext);
    const ciphertextString = new TextDecoder("utf-8", { fatal: false }).decode(
      result.chunks[0].ciphertext
    );

    // Verify 0% leak of secret keyword in ciphertext
    expect(ciphertextHex).not.toContain(Buffer.from(SECRET_KEYWORD).toString("hex"));
    expect(ciphertextString).not.toContain(SECRET_KEYWORD);

    // Verify 0% leak of conversation or filename in storage key
    expect(result.storageKey).not.toContain("classified");
    expect(result.storageKey).not.toContain("conversation");
    expect(result.storageKey).toMatch(/^attachments\/e2ee\/[a-f0-9-]+\.bin$/);
  });

  it("negative security test: wrong key fails decryption", async () => {
    const plaintext = new TextEncoder().encode("Confidential message");
    const result = await attachmentCryptoService.encryptFile({
      plaintext,
      filename: "test.txt",
      mimeType: "text/plain",
    });

    const tamperedEnvelope: E2EEAttachmentEnvelope = {
      ...result.envelope,
      attachment_key_hex: bufferToHex(crypto.getRandomValues(new Uint8Array(32))),
    };

    await expect(
      attachmentCryptoService.decryptFile(tamperedEnvelope, result.chunks)
    ).rejects.toThrow();
  });

  it("negative security test: tampered ciphertext chunk fails authentication", async () => {
    const plaintext = new TextEncoder().encode("Important financial data");
    const result = await attachmentCryptoService.encryptFile({
      plaintext,
      filename: "data.csv",
      mimeType: "text/csv",
    });

    // Tamper single byte of ciphertext
    const corruptedChunks: EncryptedChunk[] = result.chunks.map((c) => {
      const copy = new Uint8Array(c.ciphertext);
      copy[0] ^= 0xff; // flip bits
      return { ...c, ciphertext: copy };
    });

    await expect(
      attachmentCryptoService.decryptFile(result.envelope, corruptedChunks)
    ).rejects.toThrow("AES-GCM decryption failed for chunk 0");
  });

  it("negative security test: tampered SHA-256 digest fails closed", async () => {
    const plaintext = new TextEncoder().encode("Integrity check text");
    const result = await attachmentCryptoService.encryptFile({
      plaintext,
      filename: "check.txt",
      mimeType: "text/plain",
    });

    const tamperedEnvelope: E2EEAttachmentEnvelope = {
      ...result.envelope,
      sha256_plaintext_hex: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    await expect(
      attachmentCryptoService.decryptFile(tamperedEnvelope, result.chunks)
    ).rejects.toThrow("Plaintext integrity mismatch!");
  });

  it("negative security test: missing or non-sequential chunk indices fail validation", async () => {
    const mockChunks: EncryptedChunk[] = [
      { chunkIndex: 0, ciphertext: new Uint8Array(10) },
      { chunkIndex: 2, ciphertext: new Uint8Array(10) }, // Missing chunkIndex 1
    ];
    const mockEnvelope: E2EEAttachmentEnvelope = {
      attachment_id: "test-id",
      original_filename: "test.bin",
      mime_type: "application/octet-stream",
      plaintext_size_bytes: 20,
      sha256_plaintext_hex: "abc",
      base_nonce_hex: bufferToHex(new Uint8Array(12)),
      chunk_count: 2,
      chunk_size_bytes: 10,
      storage_key: "attachments/e2ee/test-id.bin",
      attachment_key_hex: bufferToHex(new Uint8Array(32)),
    };

    await expect(
      attachmentCryptoService.decryptFile(mockEnvelope, mockChunks)
    ).rejects.toThrow("Invalid or out-of-order chunk index 2 at position 1");
  });

  it("RAM lifecycle best-effort zeroization works", () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5]);
    zeroizeBuffer(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });
});
