// @ts-nocheck
import { expect, test } from "@playwright/test";

test("SDK IndexedDB + PQXDH browser round trip keeps relay opaque", async ({ page }) => {
  await page.goto("/e2ee-browser-smoke.html");
  await page.waitForFunction(() => typeof window.runE2eeBrowserSmoke === "function", { timeout: 15_000 });
  const result = await page.evaluate(() => window.runE2eeBrowserSmoke());
  if (!result.success) {
    console.error("BROWSER SMOKE FAILURE DIAGNOSTIC:", JSON.stringify(result, null, 2));
  }
  expect(result.success).toBe(true);
  expect(result.indexedDbPresent).toBe(true);
  expect(result.webCryptoUsed).toBe(true);
  expect(result.plaintext).toContain("browser-only plaintext");
  expect(result.relayCiphertext!).not.toContain("browser-only plaintext");
  expect(result.relayCiphertext!.length).toBeGreaterThan(100);
});
