const SUPABASE_URL_ENV = "PUBLIC_SUPABASE_URL";
const SUPABASE_KEY_ENV = "PUBLIC_SUPABASE_ANON_KEY";

export default async function supabaseKeepalive() {
  const supabaseUrl = process.env[SUPABASE_URL_ENV];
  const supabaseKey = process.env[SUPABASE_KEY_ENV];

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      `Supabase keepalive requires ${SUPABASE_URL_ENV} and ${SUPABASE_KEY_ENV}`,
    );
  }

  const endpoint = new URL("/rest/v1/blog_posts", supabaseUrl);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    headers: {
      apikey: supabaseKey,
      Accept: "application/json",
      "User-Agent": "Yali-Supabase-Keepalive/1.0",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Supabase keepalive failed with HTTP ${response.status}`);
  }

  console.log(`[Keepalive] Supabase responded with HTTP ${response.status}`);
  return new Response(null, { status: 204 });
}

export const config = {
  schedule: "17 12 * * 1,4",
};
