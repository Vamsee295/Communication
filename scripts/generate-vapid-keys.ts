import { base64UrlEncode } from "../src/lib/push/vapid-sender";

async function main() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const rawPub = await crypto.subtle.exportKey("raw", pair.publicKey);
  const rawPriv = await crypto.subtle.exportKey("pkcs8", pair.privateKey);

  const publicKey = base64UrlEncode(rawPub);
  const privateKey = base64UrlEncode(rawPriv);

  console.log("=== GHOSTLINE VAPID KEY GENERATOR ===");
  console.log("Copy these environment variables to your Vercel Project & local .env:\n");
  console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
  console.log(`VAPID_SUBJECT=mailto:admin@ghostline.app\n`);
  console.log("=====================================");
}

main().catch(console.error);
