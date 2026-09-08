/**
 * Standards-compliant Web Push VAPID Authentication & Payload Encryption
 * Using native Web Crypto API (SubtleCrypto) + fetch.
 * Compatible with V8 Isolates (Cloudflare Workers) and Node.js 18+.
 */

// Helper to convert Uint8Array to ArrayBuffer for Web Crypto strict type matching
function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

// Base64URL Encoding / Decoding utilities
export function base64UrlEncode(buffer: Uint8Array | ArrayBuffer): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function base64UrlDecode(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, curr) => acc + curr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Convert VAPID uncompressed public key (65 bytes 0x04 || X || Y) to JWK format
function rawPublicKeyToJwk(rawKey: Uint8Array, keyType: "ECDSA" | "ECDH"): JsonWebKey {
  if (rawKey.length !== 65 || rawKey[0] !== 0x04) {
    throw new Error("Invalid raw uncompressed P-256 public key (expected 65 bytes starting with 0x04)");
  }
  const x = base64UrlEncode(rawKey.subarray(1, 33));
  const y = base64UrlEncode(rawKey.subarray(33, 65));
  return {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    ext: true,
    key_ops: keyType === "ECDSA" ? ["verify"] : [],
  };
}

// Import VAPID private key (PKCS#8, raw 32-byte scalar, or JWK) for ES256 signing
async function importVapidPrivateKey(privateKey: string): Promise<CryptoKey> {
  const trimmed = privateKey.trim();

  // 1. Raw base64url 32-byte private scalar
  if (!trimmed.includes("{") && !trimmed.includes("-----BEGIN")) {
    const raw = base64UrlDecode(trimmed);
    if (raw.length === 32) {
      const jwk: JsonWebKey = {
        kty: "EC",
        crv: "P-256",
        d: base64UrlEncode(raw),
      };
      try {
        return await crypto.subtle.importKey(
          "jwk",
          jwk,
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["sign"]
        );
      } catch {
        const pkcs8Header = new Uint8Array([
          0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
          0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
          0x01, 0x01, 0x04, 0x20
        ]);
        const der = concatUint8Arrays(pkcs8Header, raw);
        return await crypto.subtle.importKey(
          "pkcs8",
          toBuffer(der),
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["sign"]
        );
      }
    }
  }

  // 2. JWK JSON string
  if (trimmed.startsWith("{")) {
    const jwk = JSON.parse(trimmed) as JsonWebKey;
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  }

  // 3. PKCS#8 PEM string
  const base64Pem = trimmed
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = base64UrlDecode(base64Pem);
  return await crypto.subtle.importKey(
    "pkcs8",
    toBuffer(der),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

/**
 * Generate VAPID Authorization header (RFC 8292 / VAPID specification)
 */
export async function createVapidAuthorizationHeader(
  endpointUrl: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ authorization: string; cryptoKey?: string }> {
  const url = new URL(endpointUrl);
  const audience = `${url.protocol}//${url.host}`;
  const expiration = Math.floor(Date.now() / 1000) + 12 * 3600; // 12 hours

  const header = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: audience,
    exp: expiration,
    sub: vapidSubject,
  };

  const unsignedToken = `${base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))}.${base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))}`;

  const privateKey = await importVapidPrivateKey(vapidPrivateKey);
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${base64UrlEncode(signatureBuffer)}`;
  const publicKeyBase64Url = vapidPublicKey.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  return {
    authorization: `vapid t=${jwt}, k=${publicKeyBase64Url}`,
  };
}

/**
 * Web Push Encryption (rfc8291 aes128gcm)
 * Encrypts payload using receiver's p256dh public key and auth secret.
 */
export async function encryptWebPushPayload(
  userPublicKeyBase64Url: string,
  userAuthBase64Url: string,
  payloadText: string
): Promise<{ cipherText: Uint8Array }> {
  const userPublicKeyBytes = base64UrlDecode(userPublicKeyBase64Url);
  const userAuthBytes = base64UrlDecode(userAuthBase64Url);

  // 1. Import receiver's P-256 public key for ECDH
  const receiverJwk = rawPublicKeyToJwk(userPublicKeyBytes, "ECDH");
  const receiverPublicKey = await crypto.subtle.importKey(
    "jwk",
    receiverJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // 2. Generate sender ephemeral P-256 key pair
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // 3. Export sender ephemeral uncompressed raw public key (65 bytes)
  const senderPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", senderKeyPair.publicKey)
  );

  // 4. Derive shared secret via ECDH
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPublicKey },
    senderKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // 5. Generate 16-byte random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 6. HKDF key derivation according to RFC 8291 (aes128gcm)
  const authKey = await crypto.subtle.importKey("raw", toBuffer(userAuthBytes), "HKDF", false, ["deriveBits"]);
  const prkKeyBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBuffer(userAuthBytes),
      info: new TextEncoder().encode("WebPush: info\0")
    },
    authKey,
    256
  );

  const keyInfo = concatUint8Arrays(
    new TextEncoder().encode("WebPush: key\0"),
    userPublicKeyBytes,
    senderPublicKeyRaw
  );

  const ikmKey = await crypto.subtle.importKey("raw", toBuffer(sharedSecret), "HKDF", false, ["deriveBits"]);
  const ikmBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBuffer(userAuthBytes),
      info: toBuffer(keyInfo)
    },
    ikmKey,
    256
  );

  const cekKeyInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const nonceKeyInfo = new TextEncoder().encode("Content-Encoding: nonce\0");

  const masterKey = await crypto.subtle.importKey("raw", ikmBits, "HKDF", false, ["deriveKey", "deriveBits"]);

  const cek = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBuffer(salt),
      info: toBuffer(cekKeyInfo)
    },
    masterKey,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt"]
  );

  const nonceBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBuffer(salt),
      info: toBuffer(nonceKeyInfo)
    },
    masterKey,
    96
  );
  const nonce = new Uint8Array(nonceBits);

  // 7. Pad plaintext payload (RFC 8291 requires delimiter 0x02 after record payload)
  const payloadBytes = new TextEncoder().encode(payloadText);
  const recordPayload = concatUint8Arrays(payloadBytes, new Uint8Array([0x02]));

  // 8. Encrypt payload with AES-GCM-128
  const encryptedContentBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(nonce) },
    cek,
    toBuffer(recordPayload)
  );
  const encryptedContent = new Uint8Array(encryptedContentBuffer);

  // 9. Construct aes128gcm header
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]);
  const idlen = new Uint8Array([senderPublicKeyRaw.length]);

  const header = concatUint8Arrays(salt, rs, idlen, senderPublicKeyRaw);
  const cipherText = concatUint8Arrays(header, encryptedContent);

  return { cipherText };
}

export type WebPushNotificationPayload = {
  title: string;
  body: string;
  notificationId: string;
  conversationId?: string;
  senderName?: string;
  groupName?: string;
};

/**
 * Send encrypted Web Push notification to subscription endpoint
 */
export async function sendWebPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: WebPushNotificationPayload,
  vapidConfig: { publicKey: string; privateKey: string; subject: string }
): Promise<{ success: boolean; statusCode: number; removeSubscription: boolean }> {
  try {
    const payloadText = JSON.stringify(payload);
    const { cipherText } = await encryptWebPushPayload(subscription.p256dh, subscription.auth, payloadText);
    const { authorization } = await createVapidAuthorizationHeader(
      subscription.endpoint,
      vapidConfig.publicKey,
      vapidConfig.privateKey,
      vapidConfig.subject
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
      "Authorization": authorization,
    };

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers,
      body: toBuffer(cipherText),
    });

    const removeSubscription = res.status === 404 || res.status === 410;

    return {
      success: res.ok,
      statusCode: res.status,
      removeSubscription,
    };
  } catch (error) {
    console.error("[WEB_PUSH_SEND_ERROR]", error);
    return {
      success: false,
      statusCode: 0,
      removeSubscription: false,
    };
  }
}
