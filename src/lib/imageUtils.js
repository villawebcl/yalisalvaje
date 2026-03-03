const SUPABASE_PUBLIC_MARKER = "/storage/v1/object/public/";

export const buildOptimizedImageUrl = (url, options = {}) => {
  const enableTransform = import.meta.env.PUBLIC_ENABLE_SUPABASE_IMAGE_TRANSFORM === "true";
  const { width = 1200, quality = 68, format = "webp" } = options;
  const value = String(url || "").trim();
  if (!enableTransform) return value;
  if (!value || !value.includes(SUPABASE_PUBLIC_MARKER)) return value;

  try {
    const parsed = new URL(value);
    const markerIndex = parsed.pathname.indexOf(SUPABASE_PUBLIC_MARKER);
    if (markerIndex === -1) return value;
    const pathAfterMarker = parsed.pathname.slice(markerIndex + SUPABASE_PUBLIC_MARKER.length);
    const slashIndex = pathAfterMarker.indexOf("/");
    if (slashIndex === -1) return value;

    const bucket = pathAfterMarker.slice(0, slashIndex);
    const objectPath = pathAfterMarker.slice(slashIndex + 1);
    if (!bucket || !objectPath) return value;

    const renderPath = `/storage/v1/render/image/public/${bucket}/${objectPath}`;
    const renderUrl = new URL(renderPath, parsed.origin);
    renderUrl.searchParams.set("width", String(Math.max(160, Math.round(width))));
    renderUrl.searchParams.set("quality", String(Math.max(30, Math.min(90, Math.round(quality)))));
    renderUrl.searchParams.set("format", format);
    return renderUrl.toString();
  } catch {
    return value;
  }
};

export const buildResponsiveSrcSet = (url, options = {}) => {
  const widths = Array.isArray(options.widths) ? options.widths : [480, 760, 980];
  const quality = Number(options.quality ?? 64);
  const format = options.format || "webp";
  const entries = widths
    .map((width) => Number(width))
    .filter((width) => Number.isFinite(width) && width > 0)
    .sort((a, b) => a - b)
    .map((width) => {
      const transformed = buildOptimizedImageUrl(url, { width, quality, format });
      if (!transformed || transformed === url) return null;
      return `${transformed} ${width}w`;
    })
    .filter(Boolean);

  return entries.join(", ");
};
