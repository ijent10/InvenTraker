const isProd = process.env.NODE_ENV === "production"

const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.gstatic.com"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.gstatic.com"

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://*.firestore.googleapis.com https://*.cloudfunctions.net wss://*.firebaseio.com",
  "frame-src https://checkout.stripe.com https://billing.stripe.com",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com"
]

if (isProd) {
  cspDirectives.push("upgrade-insecure-requests")
}

const csp = cspDirectives.join("; ")

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@inventracker/ui", "@inventracker/shared"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Content-Security-Policy", value: csp }
        ].concat(
          isProd
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []
        )
      }
    ]
  },
  webpack(config, { dev }) {
    if (dev) {
      // Local macOS Desktop/iCloud setups can intermittently corrupt Next webpack cache
      // (missing vendor-chunks / ENOENT rename). Disable FS cache in dev for stability.
      config.cache = false
    }
    return config
  }
}

export default nextConfig
