import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Propagate the current pathname downstream as a request header so server
  // components (specifically requireProfile) can preserve deep-link context
  // when redirecting an unauthenticated visitor to /login. Without this, a
  // user who follows /quotes/abc123 while logged out ends up on /dashboard
  // after sign-in and has to navigate back manually.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  await supabase.auth.getUser();
  return response;
}

// Matcher intentionally excludes:
//  - _next/* and static assets (no auth needed for next-served files)
//  - /api/* (each API route enforces its own auth; running getUser here would
//    double the round-trip and breaks Bearer-auth flows like the cron sync)
//  - /track/* (email open-tracking pixel — must never gate on auth)
//  - /auth/callback (Supabase OAuth handler — touches its own cookies)
//  - /login, /forgot-password, /reset-password (public, render their own check)
//  - /favicon.ico
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api|track|auth/callback|login|forgot-password|reset-password|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
