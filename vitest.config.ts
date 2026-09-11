import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["node_modules", "dist", ".idea", ".git", ".cache", "tests/browser/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@open-e2ee/signal-protocol-sdk/local/store/memory": path.resolve(__dirname, "./tests/mocks/open-e2ee.ts"),
      "@open-e2ee/signal-protocol-sdk/remote/relay/memory": path.resolve(__dirname, "./tests/mocks/open-e2ee.ts"),
      "@open-e2ee/signal-protocol-sdk/local/store/web": path.resolve(__dirname, "./tests/mocks/open-e2ee.ts"),
      "@open-e2ee/signal-protocol-sdk/remote/relay": path.resolve(__dirname, "./tests/mocks/open-e2ee.ts"),
      "@open-e2ee/signal-protocol-sdk": path.resolve(__dirname, "./tests/mocks/open-e2ee.ts"),
    },
  },
});

