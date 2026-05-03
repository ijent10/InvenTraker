import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const needsAuth = pathname.startsWith("/app") || pathname.startsWith("/admin")
  if (!needsAuth) {
    return NextResponse.next()
  }

  const sessionHint = request.cookies.get("it_session")?.value
  if (sessionHint === "1") {
    return NextResponse.next()
  }

  const signInUrl = new URL("/signin", request.url)
  signInUrl.searchParams.set("next", pathname)
  return NextResponse.redirect(signInUrl)
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"]
}

