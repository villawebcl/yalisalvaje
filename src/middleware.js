import { defineMiddleware } from "astro/middleware";
import { getAdminSessionToken, verifyAdminSessionToken } from "./lib/adminSession.js";

const buildSecurityHeaders = () => {
  const headers = new Headers();
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' https: data:",
      "connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

  return headers;
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const token = getAdminSessionToken(context.request);
    const session = verifyAdminSessionToken(token);
    if (!session) {
      return context.redirect("/login");
    }
  }

  const response = await next();
  const securityHeaders = buildSecurityHeaders();
  const headers = new Headers(response.headers);
  securityHeaders.forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
