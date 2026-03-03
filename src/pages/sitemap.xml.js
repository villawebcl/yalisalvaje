import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export async function GET({ site }) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: latestPost } = await supabase
    .from("blog_posts")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, updated_at")
    .order("updated_at", { ascending: false });

  const now = new Date().toISOString();
  const blogLastmod = latestPost?.updated_at || now;
  const pages = [
    { url: "", lastmod: now },
    { url: "blog", lastmod: blogLastmod },
    { url: "galeria", lastmod: now },
    { url: "contacto", lastmod: now },
  ];

  const siteUrl = (site?.href || "https://yalisalvaje.cl").replace(/\/$/, "");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages
    .map(
      (page) => `
    <url>
      <loc>${siteUrl}/${page.url}</loc>
      <lastmod>${page.lastmod}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>${page.url === "" ? "1.0" : "0.8"}</priority>
    </url>`
    )
    .join("")}
  ${(posts || [])
    .map(
      (post) => `
    <url>
      <loc>${siteUrl}/blog/${post.id}</loc>
      <lastmod>${post.updated_at || now}</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.7</priority>
    </url>`,
    )
    .join("")}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
