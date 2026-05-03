import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const sharedSource = fileURLToPath(new URL("../packages/shared/src", import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@inventracker\/shared$/, replacement: `${sharedSource}/index.ts` },
      { find: /^@inventracker\/shared\/(.+)$/, replacement: `${sharedSource}/$1` }
    ]
  },
  test: {
    environment: "node"
  }
})
