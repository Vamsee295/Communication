const KEY = "ghostline.device_key";

export function getDeviceKey(userId?: string): string {
  if (typeof window === "undefined") return "ssr";
  const actualKey = userId ? `${KEY}.${userId}` : KEY;
  let key = localStorage.getItem(actualKey);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(actualKey, key);
    if (!userId) {
      localStorage.setItem(KEY, key);
    }
  }
  return key;
}

export function rotateDeviceKey(userId?: string): string {
  if (typeof window === "undefined") return "ssr";
  const newKey = crypto.randomUUID();
  if (userId) {
    localStorage.setItem(`${KEY}.${userId}`, newKey);
    localStorage.setItem(KEY, newKey);
  } else {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(KEY)) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
    localStorage.setItem(KEY, newKey);
  }
  return newKey;
}

export function clearDeviceKey(userId?: string): void {
  if (typeof window === "undefined") return;
  if (userId) {
    localStorage.removeItem(`${KEY}.${userId}`);
    localStorage.removeItem(KEY);
  } else {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(KEY)) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
  }
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

