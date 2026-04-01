import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GUEST_ONLY_PATHS, PROTECTED_PREFIXES } from "@/lib/auth-routing";

const SESSION_COOKIE_HINT = /(^|;\s)[^=]*session[^=]*=/i;

const hasSessionCookie = (request: NextRequest): boolean => {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return false;
  }

  return SESSION_COOKIE_HINT.test(cookieHeader);
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedPath = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isGuestOnlyPath = GUEST_ONLY_PATHS.has(pathname);

  if (!isProtectedPath && !isGuestOnlyPath) {
    return NextResponse.next();
  }

  const hasSession = hasSessionCookie(request);

  console.info("[auth][proxy] request", {
    pathname,
    isProtectedPath,
    isGuestOnlyPath,
    hasSession,
  });

  if (isProtectedPath && !hasSession) {
    console.warn("[auth][proxy] protected route without session cookie, redirecting to /login", {
      pathname,
    });

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // In production, Laravel Sanctum session validation can succeed in the
  // browser but fail from this server-side proxy because the edge/server fetch
  // does not perfectly reproduce the original first-party SPA request context.
  // We only use cookie presence for route gating here and let the client-side
  // AuthGuard perform the authoritative `/user` validation after navigation.
  if (isGuestOnlyPath && hasSession) {
    console.info("[auth][proxy] guest-only route with session cookie, redirecting to /dashboard", {
      pathname,
    });

    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/users/:path*",
    "/roles/:path*",
    "/permissions/:path*",
    "/masseges/:path*",
    "/message/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ],
};
