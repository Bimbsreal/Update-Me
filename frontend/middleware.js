import { NextResponse } from 'next/server';

const COOKIE_NAME = 'um_session';

/** Authenticated-only surfaces. Public information pages are intentionally excluded. */
const protectedPrefixes = [
  '/home',
  '/onboarding',
  '/app',
  '/notifications',
  '/profile',
  '/admin',
];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/home/:path*',
    '/onboarding',
    '/app/:path*',
    '/notifications',
    '/notifications/:path*',
    '/profile',
    '/profile/:path*',
    '/admin',
    '/admin/:path*',
    '/login',
    '/register',
  ],
};
