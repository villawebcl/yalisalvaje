import crypto from "node:crypto";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60;

const base64UrlEncode = (value) => Buffer.from(value).toString("base64url");
const base64UrlDecode = (value) => Buffer.from(value, "base64url").toString("utf8");

const getSessionSecret = () => import.meta.env.ADMIN_SESSION_SECRET || "";

const isHttpsRequest = (request, url) => {
  if (url.protocol === "https:") return true;
  const forwardedProto = request.headers.get("x-forwarded-proto") || "";
  return forwardedProto.split(",").map((value) => value.trim()).includes("https");
};

const parseCookieHeader = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [rawName, ...rest] = part.trim().split("=");
    if (!rawName) return acc;
    acc[rawName] = rest.join("=");
    return acc;
  }, {});
};

const safeCompare = (a, b) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export const getAdminSessionToken = (request) => {
  const cookieHeader = request.headers.get("cookie");
  const cookies = parseCookieHeader(cookieHeader);
  return cookies[COOKIE_NAME] || "";
};

export const createAdminSessionToken = (email) => {
  const secret = getSessionSecret();
  if (!secret) return "";

  const payload = {
    email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
};

export const verifyAdminSessionToken = (token) => {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  if (!safeCompare(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload?.email || !payload?.exp) return null;
    if (Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

export const buildAdminSessionCookie = (token, request, maxAge = SESSION_TTL_SECONDS) => {
  const url = new URL(request.url);
  const secure = isHttpsRequest(request, url) ? " Secure;" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Max-Age=${maxAge}; SameSite=Strict;${secure}`;
};

export const buildClearAdminSessionCookie = (request) => buildAdminSessionCookie("", request, 0);
