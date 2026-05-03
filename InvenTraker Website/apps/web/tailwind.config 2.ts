import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/shared/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      borderRadius: {
        card: "24px"
      },
      boxShadow: {
        card: "var(--app-shadow)"
      },
      colors: {
        app: {
          surface: "var(--app-surface)",
          surfaceSoft: "var(--app-surface-soft)",
          text: "var(--app-text)",
          muted: "var(--app-muted)",
          border: "var(--app-border)"
        }
      }
    }
  },
  plugins: []
}

export default config
