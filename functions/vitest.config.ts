import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { defineConfig } from "vitest/config"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  resolve: {
    alias: {
      "@inventracker/shared": resolve(__dirname, "../packages/shared/src/index.ts"),
      "@inventracker/shared/": resolve(__dirname, "../packages/shared/src/")
    }
  },
  test: {
    environment: "node"
  }
})
