import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GUEST_ONLY_PATHS, PROTECTED_PREFIXES } from "@/lib/auth-routing";

const SESSION_COOKIE_HINT = /(^|;\s)[^=]*session[^=]*=/i;

const getUserEndpoint = (): string | null => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    return null;
  }

  const normalizedApiUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  return new URL("user", normalizedApiUrl).toString();
};

const isAuthenticated = async (request: NextRequest): Promise<boolean> => {
  const userEndpoint = getUserEndpoint();
  const cookieHeader = request.headers.get("cookie");
  const requestOrigin = request.nextUrl.origin;

  if (!userEndpoint || !cookieHeader) {
    return false;
  }

  try {
    const response = await fetch(userEndpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
        Origin: requestOrigin,
        Referer: `${requestOrigin}/`,
      },
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
};

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

  if (isProtectedPath && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const authenticated =
    isGuestOnlyPath || (isProtectedPath && hasSession) ? await isAuthenticated(request) : false;

  if (isProtectedPath && !authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isGuestOnlyPath && authenticated) {
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
