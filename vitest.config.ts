import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@agente/schemas": fileURLToPath(new URL("./packages/schemas/src/index.ts", import.meta.url)),
      "@agente/engine": fileURLToPath(new URL("./packages/engine/src/index.ts", import.meta.url)),
      "@agente/guardian": fileURLToPath(new URL("./packages/guardian/src/index.ts", import.meta.url)),
      "@agente/pipeline": fileURLToPath(new URL("./packages/pipeline/src/index.ts", import.meta.url))
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "eval/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    globals: false
  }
});
