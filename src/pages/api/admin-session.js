import { createClient } from "@supabase/supabase-js";
import {
  buildAdminSessionCookie,
  buildClearAdminSessionCookie,
  createAdminSessionToken,
} from "../../lib/adminSession.js";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

const ADMIN_EMAIL = import.meta.env.ADMIN_EMAIL || "cristianvillalobosvv@gmail.com";

const isSameOrigin = (request) => {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  return origin === url.origin;
};

export async function POST({ request }) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response("Missing Supabase env", { status: 500 });
  }
  if (!isSameOrigin(request)) {
    return new Response("Forbidden origin", { status: 403 });
  }

  const { accessToken } = await request.json().catch(() => ({}));
  if (!accessToken) {
    return new Response("Missing access token", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Security: Restricted to specific email
  if (data.user.email !== ADMIN_EMAIL) {
    console.warn(`Unauthorized access attempt by: ${data.user.email}`);
    return new Response("Forbidden: Not an admin", { status: 403 });
  }

  const sessionToken = createAdminSessionToken(data.user.email);
  if (!sessionToken) {
    return new Response("Missing ADMIN_SESSION_SECRET", { status: 500 });
  }

  return new Response("OK", {
    status: 200,
    headers: {
      "Set-Cookie": buildAdminSessionCookie(sessionToken, request),
    },
  });
}

export async function DELETE({ request }) {
  if (!isSameOrigin(request)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  return new Response("OK", {
    status: 200,
    headers: {
      "Set-Cookie": buildClearAdminSessionCookie(request),
    },
  });
}
