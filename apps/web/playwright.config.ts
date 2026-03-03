import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./src/tests/e2e",
  timeout: 90_000,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL: "http://127.0.0.1:3000"
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 180_000
  }
})
