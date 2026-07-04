function firebaseWebConfig() {
  if (!process.env.FIREBASE_WEBAPP_CONFIG) return {}

  try {
    return JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG)
  } catch {
    return {}
  }
}

const firebaseConfig = firebaseWebConfig()

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || firebaseConfig.apiKey || "",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain || "",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || firebaseConfig.projectId || "",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || "",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId || "",
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || firebaseConfig.appId || "",
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || firebaseConfig.measurementId || "",
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || ""
  },
  async rewrites() {
    return [
      {
        source: "/_next/static/css/app/layout.css",
        destination: "/app.css"
      }
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com"
      },
      {
        protocol: "https",
        hostname: "**.firebasestorage.app"
      }
    ]
  }
}

export default nextConfig
