import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Tests unitaires TypeScript (logique pure : résolution de l'adresse, secret, décisions).
// Les tests de la base restent en pgTAP (npm run db:test).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
