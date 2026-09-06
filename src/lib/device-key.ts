const KEY = "ghostline.device_key";

export function getDeviceKey(userId?: string): string {
  if (typeof window === "undefined") return "ssr";
  const actualKey = userId ? `${KEY}.${userId}` : KEY;
  let key = localStorage.getItem(actualKey);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(actualKey, key);
  }
  return key;
}

export function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "Web";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux";
  return "Web browser";
}
