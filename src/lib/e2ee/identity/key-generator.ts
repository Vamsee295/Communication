import { ed25519, x25519 } from "@noble/curves/ed25519.js";

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type KeyPairB64 = {
  publicKey: string;
  privateKey: string;
};

export type SignedPreKeyB64 = KeyPairB64 & {
  signature: string;
};

export type OneTimePreKeyB64 = KeyPairB64 & {
  keyId: number;
};

/**
 * Generate Ed25519 Identity KeyPair (Public & Private)
 */
export function generateIdentityKeyPair(): KeyPairB64 {
  const { secretKey, publicKey } = ed25519.keygen();
  return {
    privateKey: bytesToBase64(secretKey),
    publicKey: bytesToBase64(publicKey),
  };
}

/**
 * Generate X25519 Signed PreKey and sign it with the Ed25519 Identity Private Key
 */
export function generateSignedPreKey(identityPrivateKeyB64: string): SignedPreKeyB64 {
  const identityPrivateKeyBytes = base64ToBytes(identityPrivateKeyB64);
  const { secretKey, publicKey } = x25519.keygen();

  // Sign the X25519 public key bytes using Ed25519 identity key
  const signatureBytes = ed25519.sign(publicKey, identityPrivateKeyBytes);

  return {
    privateKey: bytesToBase64(secretKey),
    publicKey: bytesToBase64(publicKey),
    signature: bytesToBase64(signatureBytes),
  };
}

/**
 * Verify signature of a Signed PreKey against an Identity Public Key
 */
export function verifySignedPreKeySignature(
  identityPublicKeyB64: string,
  signedPreKeyPublicKeyB64: string,
  signatureB64: string
): boolean {
  try {
    const identityPublicKeyBytes = base64ToBytes(identityPublicKeyB64);
    const spkPublicKeyBytes = base64ToBytes(signedPreKeyPublicKeyB64);
    const signatureBytes = base64ToBytes(signatureB64);

    return ed25519.verify(signatureBytes, spkPublicKeyBytes, identityPublicKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Generate a batch of X25519 One-Time PreKeys
 */
export function generateOneTimePreKeys(startKeyId: number, count: number): OneTimePreKeyB64[] {
  const keys: OneTimePreKeyB64[] = [];
  for (let i = 0; i < count; i++) {
    const keyId = startKeyId + i;
    const { secretKey, publicKey } = x25519.keygen();
    keys.push({
      keyId,
      privateKey: bytesToBase64(secretKey),
      publicKey: bytesToBase64(publicKey),
    });
  }
  return keys;
}
