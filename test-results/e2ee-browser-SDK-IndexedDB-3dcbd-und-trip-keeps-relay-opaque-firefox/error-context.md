# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2ee-browser.spec.ts >> SDK IndexedDB + PQXDH browser round trip keeps relay opaque
- Location: tests\browser\e2ee-browser.spec.ts:3:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 60000ms exceeded.
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("SDK IndexedDB + PQXDH browser round trip keeps relay opaque", async ({ page }) => {
  4  |   await page.goto("/e2ee-browser-smoke.html");
> 5  |   await page.waitForFunction(() => typeof window.runE2eeBrowserSmoke === "function", { timeout: 15_000 });
     |              ^ Error: page.waitForFunction: Test timeout of 60000ms exceeded.
  6  |   const result = await page.evaluate(() => window.runE2eeBrowserSmoke());
  7  |   if (!result.success) {
  8  |     console.error("BROWSER SMOKE FAILURE DIAGNOSTIC:", JSON.stringify(result, null, 2));
  9  |   }
  10 |   expect(result.success).toBe(true);
  11 |   expect(result.indexedDbPresent).toBe(true);
  12 |   expect(result.webCryptoUsed).toBe(true);
  13 |   expect(result.plaintext).toContain("browser-only plaintext");
  14 |   expect(result.relayCiphertext!).not.toContain("browser-only plaintext");
  15 |   expect(result.relayCiphertext!.length).toBeGreaterThan(100);
  16 | });
  17 | 
```