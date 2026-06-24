import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A1220",
        panel: "#111827",
        line: "#253247",
        muted: "#94A3B8",
        brand: "#2563EB",
        mint: "#16A34A",
        amber: "#D97706"
      },
      boxShadow: {
        lift: "0 20px 60px rgba(2, 8, 23, 0.28)"
      },
      borderRadius: {
        panel: "8px"
      }
    }
  },
  plugins: []
}

export default config
