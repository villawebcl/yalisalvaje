import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.__SUPABASE__ || {};
const supabaseUrl = config.url;
const supabaseAnonKey = config.key;

const storage = typeof window !== "undefined" ? window.sessionStorage : undefined;
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage,
  },
});

const STORAGE_BUCKET = "media";
const BLOG_FOLDER = "blog";
const GALLERY_FOLDER = "galeria";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ENABLE_IMAGE_TRANSFORM = window.__ENABLE_IMAGE_TRANSFORM__ === true;

const banner = document.querySelector(".auth-status");
const bannerText = banner?.querySelector(".status-text");
const logoutButton = document.getElementById("logout");

const blogForm = document.getElementById("blog-form");
const blogIdInput = blogForm?.querySelector("[name='post_id']");
const blogMessage = document.getElementById("blog-message");
const blogList = document.getElementById("blog-list");
const blogSubmit = document.getElementById("blog-submit");
const blogCancel = document.getElementById("blog-cancel");
const blogNew = document.getElementById("blog-new");
const blogModal = document.getElementById("blog-modal");
const blogModalTitle = document.getElementById("blog-modal-title");
const blogPreviewImage = document.getElementById("blog-preview-image");
const blogPreviewTitle = document.getElementById("blog-preview-title");
const blogPreviewExcerpt = document.getElementById("blog-preview-excerpt");
const blogPreviewCategory = document.getElementById("blog-preview-category");
const blogContentInput = blogForm?.querySelector("[name='contenido']");
const blogContentPreview = document.getElementById("blog-content-preview");
const blogMarkdownButtons = document.querySelectorAll(".md-btn[data-md-action]");

const galleryForm = document.getElementById("gallery-form");
const galleryIdInput = galleryForm?.querySelector("[name='image_id']");
const galleryMessage = document.getElementById("gallery-message");
const galleryList = document.getElementById("gallery-list");
const gallerySubmit = document.getElementById("gallery-submit");
const galleryCancel = document.getElementById("gallery-cancel");
const galleryNew = document.getElementById("gallery-new");
const galleryModal = document.getElementById("gallery-modal");
const galleryModalTitle = document.getElementById("gallery-modal-title");
const galleryPreviewImage = document.getElementById("gallery-preview-image");
const galleryPreviewTitle = document.getElementById("gallery-preview-title");
const galleryPreviewDetail = document.getElementById("gallery-preview-detail");
const galleryPreviewAlt = document.getElementById("gallery-preview-alt");
const galleryFeatured = galleryForm?.querySelector("[name='destacada']");
const galleryFeaturedOnly = document.getElementById("gallery-featured-only");
const galleryFeaturedLimit = document.getElementById("gallery-featured-limit");
const galleryFeaturedSave = document.getElementById("gallery-featured-save");
const gallerySettingsMessage = document.getElementById("gallery-settings-message");

const SETTINGS_TABLE = "site_settings";
const FEATURED_LIMIT_KEY = "featured_gallery_limit";

const toast = document.getElementById("toast");
let toastTimeout = null;

const showToast = (text, type = "info") => {
  if (!toast) return;
  toast.textContent = text;
  toast.setAttribute("data-status", type);
  toast.classList.add("is-visible");
  if (toastTimeout) window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2400);
};

const setMessage = (el, text, type = "info") => {
  if (!el) return;
  el.textContent = text;
  el.setAttribute("data-status", type);
  if (text) showToast(text, type);
};

if (!supabaseUrl || !supabaseAnonKey) {
  if (banner) {
    banner.setAttribute("data-state", "expired");
    if (bannerText) bannerText.textContent = "Error de configuración";
  }
}

const { data } = await supabase.auth.getSession();

if (!data?.session) {
  window.location.href = "/login";
} else {
  if (banner) {
    banner.setAttribute("data-state", "ready");
    if (bannerText) bannerText.textContent = `Conectado: ${data.session.user.email}`;
  }
}

logoutButton?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  await fetch("/api/admin-session", { method: "DELETE" });
  window.location.href = "/login";
});

supabase.auth.onAuthStateChange(async (event, session) => {
  if (!session) {
    await fetch("/api/admin-session", { method: "DELETE" });
    if (banner) {
      banner.setAttribute("data-state", "expired");
      if (bannerText) bannerText.textContent = "Sesión expirada";
    }
    showToast("Sesión expirada. Redirigiendo...", "error");
    setTimeout(() => {
      window.location.href = "/login";
    }, 1200);
  }
});

const buildFilePath = (folder, file) => {
  const safeName = file.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.-]/g, "");
  return `${folder}/${Date.now()}-${safeName}`;
};

const extractPathFromPublicUrl = (url) => {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
};

const buildOptimizedPublicUrl = (url, width = 960, quality = 64) => {
  if (!url) return "";
  if (!ENABLE_IMAGE_TRANSFORM) return url;
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return url;
    const path = parsed.pathname.slice(markerIndex + marker.length);
    const renderUrl = new URL(`/storage/v1/render/image/public/${STORAGE_BUCKET}/${path}`, parsed.origin);
    renderUrl.searchParams.set("width", String(Math.max(240, Math.round(width))));
    renderUrl.searchParams.set("quality", String(Math.max(30, Math.min(90, Math.round(quality)))));
    renderUrl.searchParams.set("format", "webp");
    return renderUrl.toString();
  } catch {
    return url;
  }
};

const removeImageByUrl = async (url) => {
  if (!url) return;
  const path = extractPathFromPublicUrl(url);
  if (!path) return;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
  if (error) throw error;
};

const uploadImage = async (file, folder) => {
  const path = buildFilePath(folder, file);
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || "image/webp",
  });
  if (error) throw error;

  const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicData.publicUrl;
};

const compressImage = async (file, options = {}) => {
  const { maxWidth = 1200, quality = 0.80 } = options;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // WebP: encodes en milisegundos (AVIF via Canvas es 10-30s, inaceptable para UX)
    const webpBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));

    // Solo usar comprimido si realmente es más liviano
    if (!webpBlob || webpBlob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([webpBlob], `${baseName}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
};

const resetBlogForm = () => {
  blogForm?.reset();
  if (blogIdInput instanceof HTMLInputElement) blogIdInput.value = "";
  if (blogSubmit) blogSubmit.textContent = "Publicar";
  if (blogCancel) blogCancel.hidden = true;
  blogForm?.removeAttribute("data-image");
  if (blogPreviewImage) blogPreviewImage.removeAttribute("src");
  if (blogPreviewTitle) blogPreviewTitle.textContent = "Título de la entrada";
  if (blogPreviewExcerpt) blogPreviewExcerpt.textContent = "Aquí aparecerá el extracto.";
  if (blogPreviewCategory) blogPreviewCategory.textContent = "Sin categoría";
  if (blogContentInput instanceof HTMLTextAreaElement) {
    blogContentInput.style.height = "";
  }
  updateBlogContentPreview("");
};

const openModal = (modalEl) => {
  if (!modalEl) return;
  modalEl.classList.add("is-open");
  modalEl.setAttribute("aria-hidden", "false");
};

const closeModal = (modalEl) => {
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  modalEl.setAttribute("aria-hidden", "true");
};

const openBlogModal = (mode = "new") => {
  if (blogModalTitle) {
    blogModalTitle.textContent = mode === "edit" ? "Editar entrada" : "Nueva entrada";
  }
  openModal(blogModal);
};

const openGalleryModal = (mode = "new") => {
  if (galleryModalTitle) {
    galleryModalTitle.textContent = mode === "edit" ? "Editar imagen" : "Nueva imagen";
  }
  openModal(galleryModal);
};

const resizeTextarea = (el) => {
  if (!(el instanceof HTMLTextAreaElement)) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

const closeBlogModal = () => {
  resetBlogForm();
  setMessage(blogMessage, "", "info");
  closeModal(blogModal);
};

const closeGalleryModal = () => {
  resetGalleryForm();
  setMessage(galleryMessage, "", "info");
  closeModal(galleryModal);
};

const resetGalleryForm = () => {
  galleryForm?.reset();
  if (galleryIdInput instanceof HTMLInputElement) galleryIdInput.value = "";
  if (gallerySubmit) gallerySubmit.textContent = "Subir imagen";
  if (galleryCancel) galleryCancel.hidden = true;
  galleryForm?.removeAttribute("data-image");
  galleryForm?.removeAttribute("data-featured-order");
  if (galleryFeatured instanceof HTMLInputElement) galleryFeatured.checked = false;
  if (galleryPreviewImage) galleryPreviewImage.removeAttribute("src");
  if (galleryPreviewTitle) galleryPreviewTitle.textContent = "Descripción de la imagen";
  if (galleryPreviewDetail) galleryPreviewDetail.textContent = "Detalle de la imagen";
  if (galleryPreviewAlt) galleryPreviewAlt.textContent = "Texto alternativo";
};

const previewFile = (file, target) => {
  if (!(file instanceof File) || file.size === 0) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (target) target.setAttribute("src", String(reader.result));
  };
  reader.readAsDataURL(file);
};

blogForm?.querySelector("[name='imagen']")?.addEventListener("change", (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.files && input.files[0]) {
    previewFile(input.files[0], blogPreviewImage);
  }
});

galleryForm?.querySelector("[name='imagen']")?.addEventListener("change", (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.files && input.files[0]) {
    previewFile(input.files[0], galleryPreviewImage);
  }
});

blogForm?.querySelector("[name='titulo']")?.addEventListener("input", (event) => {
  const value = event.target?.value ?? "";
  if (blogPreviewTitle) blogPreviewTitle.textContent = value || "Título de la entrada";
});

blogForm?.querySelector("[name='extracto']")?.addEventListener("input", (event) => {
  const value = event.target?.value ?? "";
  if (blogPreviewExcerpt) blogPreviewExcerpt.textContent = value || "Aquí aparecerá el extracto.";
});

blogContentInput?.addEventListener("input", (event) => {
  resizeTextarea(event.target);
  const value = event.target?.value ?? "";
  updateBlogContentPreview(value);
});

blogMarkdownButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.getAttribute("data-md-action");
    if (!action) return;
    handleMarkdownAction(action);
  });
});

blogForm?.querySelector("[name='categoria']")?.addEventListener("input", (event) => {
  const value = event.target?.value ?? "";
  if (blogPreviewCategory) blogPreviewCategory.textContent = value || "Sin categoría";
});

galleryForm?.querySelector("[name='titulo']")?.addEventListener("input", (event) => {
  const value = event.target?.value ?? "";
  if (galleryPreviewTitle) galleryPreviewTitle.textContent = value || "Descripción de la imagen";
});

galleryForm?.querySelector("[name='detalle']")?.addEventListener("input", (event) => {
  const value = event.target?.value ?? "";
  if (galleryPreviewDetail) galleryPreviewDetail.textContent = value || "Detalle de la imagen";
});

galleryForm?.querySelector("[name='alt']")?.addEventListener("input", (event) => {
  const value = event.target?.value ?? "";
  if (galleryPreviewAlt) galleryPreviewAlt.textContent = value || "Texto alternativo";
});

const formatDate = (value) => {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const sanitizeUrl = (value) => {
  try {
    const parsed = new URL(String(value || ""), window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return "";
  } catch {
    return "";
  }
};

const sanitizeHref = (value) => {
  const decoded = String(value || "").replace(/&amp;/g, "&");
  try {
    const parsed = new URL(decoded, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    return "#";
  } catch {
    return "#";
  }
};

const formatInlineMarkdown = (value) => {
  let formatted = String(value || "");

  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = sanitizeHref(href);
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");

  return formatted;
};

const renderMarkdownPreview = (value) => {
  const safeValue = escapeHtml(String(value || ""));
  if (!safeValue.trim()) return "";

  const lines = safeValue.split("\n");
  const blocks = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${formatInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length || !listType) return;
    const items = listItems.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join("");
    blocks.push(`<${listType}>${items}</${listType}>`);
    listItems = [];
    listType = "";
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      blocks.push(`<h${level + 2}>${formatInlineMarkdown(headingMatch[2])}</h${level + 2}>`);
      return;
    }

    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push("<hr />");
      return;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${formatInlineMarkdown(quoteMatch[1])}</blockquote>`);
      return;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(ulMatch[1]);
      return;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(olMatch[1]);
      return;
    }

    flushList();
    paragraph.push(line);
  });

  flushParagraph();
  flushList();
  return blocks.join("");
};

const updateBlogContentPreview = (value) => {
  if (!blogContentPreview) return;
  const html = renderMarkdownPreview(value);
  blogContentPreview.innerHTML = html || "<p>La vista previa aparecerá aquí.</p>";
};

const wrapSelection = (textarea, prefix, suffix = "") => {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = textarea.value.slice(start, end);
  const next = `${prefix}${selected || "texto"}${suffix}`;
  textarea.setRangeText(next, start, end, "end");
  textarea.focus();
  updateBlogContentPreview(textarea.value);
  resizeTextarea(textarea);
};

const prependByLine = (textarea, token) => {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = textarea.value.slice(start, end) || "texto";
  const lines = selected.split("\n").map((line) => `${token}${line}`);
  textarea.setRangeText(lines.join("\n"), start, end, "end");
  textarea.focus();
  updateBlogContentPreview(textarea.value);
  resizeTextarea(textarea);
};

const handleMarkdownAction = (action) => {
  if (!(blogContentInput instanceof HTMLTextAreaElement)) return;
  if (action === "h2") return prependByLine(blogContentInput, "## ");
  if (action === "h3") return prependByLine(blogContentInput, "### ");
  if (action === "bold") return wrapSelection(blogContentInput, "**", "**");
  if (action === "italic") return wrapSelection(blogContentInput, "*", "*");
  if (action === "ul") return prependByLine(blogContentInput, "- ");
  if (action === "ol") return prependByLine(blogContentInput, "1. ");
  if (action === "quote") return prependByLine(blogContentInput, "> ");
  if (action === "link") return wrapSelection(blogContentInput, "[texto](", ")");
  if (action === "hr") {
    const value = blogContentInput.value;
    blogContentInput.value = `${value}${value.trim() ? "\n\n" : ""}---\n`;
    blogContentInput.focus();
    updateBlogContentPreview(blogContentInput.value);
    resizeTextarea(blogContentInput);
  }
};

const loadFeaturedLimit = async () => {
  if (!(galleryFeaturedLimit instanceof HTMLInputElement)) return;
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select("value")
    .eq("key", FEATURED_LIMIT_KEY)
    .maybeSingle();
  if (error) return;
  const value = Number(data?.value);
  galleryFeaturedLimit.value = Number.isFinite(value) ? String(value) : "6";
};

const saveFeaturedLimit = async () => {
  if (!(galleryFeaturedLimit instanceof HTMLInputElement)) return;
  const value = Number(galleryFeaturedLimit.value);
  if (!Number.isFinite(value) || value <= 0) {
    setMessage(gallerySettingsMessage, "Ingresa un número válido.", "error");
    return;
  }
  const { error } = await supabase.from(SETTINGS_TABLE).upsert(
    {
      key: FEATURED_LIMIT_KEY,
      value: String(Math.round(value)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) {
    setMessage(gallerySettingsMessage, "No se pudo guardar el límite.", "error");
    return;
  }
  setMessage(gallerySettingsMessage, "Límite guardado.", "success");
};

const getNextFeaturedOrder = async () => {
  const { data, error } = await supabase
    .from("imagenes")
    .select("destacada_orden")
    .eq("destacada", true)
    .order("destacada_orden", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) return 1;
  const lastValue = Number(data?.[0]?.destacada_orden);
  return Number.isFinite(lastValue) ? lastValue + 1 : 1;
};

const loadBlogPosts = async () => {
  const { data: posts, error } = await supabase
    .from("blog_posts")
    .select("id, title, excerpt, image_url, category, published_at, content")
    .order("published_at", { ascending: false });

  if (error || !blogList) return;
  blogList.innerHTML = "";

  if (!posts || posts.length === 0) {
    blogList.innerHTML = "<p class='note'>Aún no hay entradas publicadas.</p>";
    return;
  }

  posts.forEach((post) => {
    const card = document.createElement("article");
    card.className = "list-card card-surface card-border card-hover media-zoom";
    const safeImageUrl = sanitizeUrl(post.image_url);
    const safeTitle = escapeHtml(post.title ?? "Entrada");
    const safeCategory = escapeHtml(post.category ?? "Sin categoría");
    const safeExcerpt = escapeHtml(post.excerpt ?? "");
    const safeId = escapeHtml(String(post.id ?? ""));

    card.innerHTML = `
      <div class="thumb">
        ${safeImageUrl
        ? `<img src="${buildOptimizedPublicUrl(safeImageUrl, 760, 60)}" alt="${safeTitle}" loading="lazy" decoding="async" />`
        : "<div class='thumb-empty'>Sin imagen</div>"
      }
      </div>
      <div class="list-body">
        <p class="tag">${safeCategory}</p>
        <h3>${safeTitle}</h3>
        <p class="excerpt">${safeExcerpt}</p>
        <p class="meta">${formatDate(post.published_at)}</p>
      </div>
      <div class="list-actions">
        <button type="button" data-action="edit" data-id="${safeId}">Editar</button>
        <button type="button" class="danger" data-action="delete" data-id="${safeId}">Eliminar</button>
      </div>
    `;

    const editButton = card.querySelector("[data-action='edit']");
    editButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (blogIdInput instanceof HTMLInputElement) blogIdInput.value = String(post.id);
      const titleInput = blogForm?.querySelector("[name='titulo']");
      const categoryInput = blogForm?.querySelector("[name='categoria']");
      const excerptInput = blogForm?.querySelector("[name='extracto']");
      const contentInput = blogForm?.querySelector("[name='contenido']");

      if (titleInput) titleInput.value = post.title ?? "";
      if (categoryInput) categoryInput.value = post.category ?? "";
      if (excerptInput) excerptInput.value = post.excerpt ?? "";
      const fullContent = post.content ?? post.contenido ?? "";
      if (contentInput) contentInput.value = fullContent;
      resizeTextarea(contentInput);
      updateBlogContentPreview(fullContent);

      blogForm?.setAttribute("data-image", post.image_url ?? "");
      if (blogPreviewImage) {
        if (safeImageUrl)
          blogPreviewImage.setAttribute("src", buildOptimizedPublicUrl(safeImageUrl, 920, 66));
        else blogPreviewImage.removeAttribute("src");
      }
      if (blogPreviewTitle) blogPreviewTitle.textContent = post.title ?? "Título de la entrada";
      if (blogPreviewExcerpt)
        blogPreviewExcerpt.textContent = post.excerpt ?? "Aquí aparecerá el extracto.";
      if (blogPreviewCategory)
        blogPreviewCategory.textContent = post.category ?? "Sin categoría";
      if (blogSubmit) blogSubmit.textContent = "Actualizar";
      if (blogCancel) blogCancel.hidden = false;
      openBlogModal("edit");
    });

    card.querySelector("[data-action='delete']")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm("¿Eliminar esta entrada?")) return;
      try {
        const { error } = await supabase.from("blog_posts").delete().eq("id", post.id);
        if (error) {
          showToast(`No se pudo eliminar: ${error.message}`, "error");
          return;
        }
        const { data: remaining, error: checkError } = await supabase
          .from("blog_posts")
          .select("id")
          .eq("id", post.id)
          .maybeSingle();
        if (checkError) {
          showToast(`No se pudo verificar el borrado: ${checkError.message}`, "error");
          return;
        }
        if (remaining?.id) {
          showToast("No se pudo eliminar (permiso o RLS).", "error");
          return;
        }
        if (post.image_url) {
          try {
            await removeImageByUrl(post.image_url);
          } catch (error) {
            showToast("Entrada eliminada, pero no se pudo borrar el archivo.", "error");
            loadBlogPosts();
            return;
          }
        }
        loadBlogPosts();
        showToast("Entrada eliminada.", "success");
      } catch (error) {
        showToast("No se pudo eliminar la entrada.", "error");
      }
    });

    card.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) return;
      editButton?.click();
    });

    blogList.appendChild(card);
  });
};

const loadGalleryItems = async () => {
  let query = supabase
    .from("imagenes")
    .select("id, url_publica, alt_text, descripcion, detalle, destacada, destacada_orden, created_at");

  const onlyFeatured = galleryFeaturedOnly instanceof HTMLInputElement && galleryFeaturedOnly.checked;
  if (onlyFeatured) {
    query = query
      .eq("destacada", true)
      .order("destacada_orden", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data: items, error } = await query;

  if (error || !galleryList) return;
  galleryList.innerHTML = "";

  if (!items || items.length === 0) {
    galleryList.innerHTML = "<p class='note'>Aún no hay imágenes publicadas.</p>";
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "list-card card-surface card-border card-hover media-zoom";
    card.dataset.id = String(item.id);
    if (onlyFeatured) card.setAttribute("draggable", "true");

    const brief = item.detalle || item.alt_text || "";
    const safeImageUrl = sanitizeUrl(item.url_publica);
    const safeAlt = escapeHtml(item.alt_text ?? "Imagen");
    const safeDescription = escapeHtml(item.descripcion ?? "Sin descripción");
    const safeBrief = escapeHtml(brief);
    const safeItemId = escapeHtml(String(item.id ?? ""));
    card.innerHTML = `
      <div class="thumb">
        ${safeImageUrl
        ? `<img src="${buildOptimizedPublicUrl(safeImageUrl, 680, 60)}" alt="${safeAlt}" loading="lazy" decoding="async" />`
        : "<div class='thumb-empty'>Imagen no válida</div>"
      }
      </div>
      <div class="list-body">
        ${item.destacada ? "<p class='tag'>Destacada</p>" : ""}
        <h3>${safeDescription}</h3>
        <p class="excerpt">${safeBrief}</p>
        <p class="meta">${formatDate(item.created_at)}</p>
      </div>
      <div class="list-actions">
        ${onlyFeatured ? "<button type='button' class='drag-handle' aria-label='Reordenar'>↕</button>" : ""}
        <button type="button" data-action="edit" data-id="${safeItemId}">Editar</button>
        <button type="button" class="danger" data-action="delete" data-id="${safeItemId}">Eliminar</button>
      </div>
    `;

    const editButton = card.querySelector("[data-action='edit']");
    editButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (galleryIdInput instanceof HTMLInputElement) galleryIdInput.value = String(item.id);
      const titleInput = galleryForm?.querySelector("[name='titulo']");
      const detailInput = galleryForm?.querySelector("[name='detalle']");
      const altInput = galleryForm?.querySelector("[name='alt']");
      if (titleInput) titleInput.value = item.descripcion ?? "";
      if (detailInput) detailInput.value = item.detalle ?? "";
      if (altInput) altInput.value = item.alt_text ?? "";
      if (galleryFeatured instanceof HTMLInputElement) {
        galleryFeatured.checked = Boolean(item.destacada);
      }
      galleryForm?.setAttribute("data-featured-order", item.destacada_orden ?? "");
      galleryForm?.setAttribute("data-image", item.url_publica ?? "");
      if (galleryPreviewImage) {
        if (safeImageUrl)
          galleryPreviewImage.setAttribute("src", buildOptimizedPublicUrl(safeImageUrl, 860, 64));
        else galleryPreviewImage.removeAttribute("src");
      }
      if (galleryPreviewTitle)
        galleryPreviewTitle.textContent = item.descripcion ?? "Descripción de la imagen";
      if (galleryPreviewDetail)
        galleryPreviewDetail.textContent = item.detalle ?? "Detalle de la imagen";
      if (galleryPreviewAlt)
        galleryPreviewAlt.textContent = item.alt_text ?? "Texto alternativo";
      if (gallerySubmit) gallerySubmit.textContent = "Actualizar";
      if (galleryCancel) galleryCancel.hidden = false;
      openGalleryModal("edit");
    });

    card.querySelector("[data-action='delete']")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm("¿Eliminar esta imagen?")) return;
      try {
        const { error } = await supabase.from("imagenes").delete().eq("id", item.id);
        if (error) {
          showToast(`No se pudo eliminar: ${error.message}`, "error");
          return;
        }
        const { data: remaining, error: checkError } = await supabase
          .from("imagenes")
          .select("id")
          .eq("id", item.id)
          .maybeSingle();
        if (checkError) {
          showToast(`No se pudo verificar el borrado: ${checkError.message}`, "error");
          return;
        }
        if (remaining?.id) {
          showToast("No se pudo eliminar (permiso o RLS).", "error");
          return;
        }
        try {
          await removeImageByUrl(item.url_publica);
        } catch (error) {
          showToast("Imagen eliminada, pero no se pudo borrar el archivo.", "error");
          loadGalleryItems();
          return;
        }
        loadGalleryItems();
        showToast("Imagen eliminada.", "success");
      } catch (error) {
        showToast("No se pudo eliminar la imagen.", "error");
      }
    });

    card.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) return;
      editButton?.click();
    });

    galleryList.appendChild(card);
  });

  if (onlyFeatured) enableGalleryDrag();
};

blogForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(blogMessage, "Guardando entrada...", "loading");

  const formData = new FormData(blogForm);
  const file = formData.get("imagen");
  const postId = blogIdInput instanceof HTMLInputElement ? blogIdInput.value : formData.get("post_id");
  const existingImage = blogForm.getAttribute("data-image");

  let imageUrl = existingImage || null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage(blogMessage, "La imagen excede 8MB. Usa una imagen más liviana.", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMessage(blogMessage, "Formato no permitido. Sube solo imágenes.", "error");
      return;
    }
    try {
      setMessage(blogMessage, "Comprimiendo imagen…", "loading");
      const optimized = await compressImage(file, { maxWidth: 1100, quality: 0.80 });
      setMessage(blogMessage, "Subiendo imagen…", "loading");
      imageUrl = await uploadImage(optimized, BLOG_FOLDER);
      if (existingImage) await removeImageByUrl(existingImage);
    } catch (error) {
      setMessage(blogMessage, "Error al subir la imagen. Intenta nuevamente.", "error");
      return;
    }
  }

  const payload = {
    title: formData.get("titulo"),
    category: formData.get("categoria"),
    excerpt: formData.get("extracto"),
    content: formData.get("contenido"),
    image_url: imageUrl,
  };

  if (postId) {
    const { error } = await supabase.from("blog_posts").update(payload).eq("id", postId);
    if (error) {
      setMessage(blogMessage, "Error al actualizar la entrada.", "error");
      return;
    }
    setMessage(blogMessage, "Entrada actualizada correctamente.", "success");
  } else {
    const { error } = await supabase.from("blog_posts").insert({
      ...payload,
      published_at: new Date().toISOString(),
    });
    if (error) {
      setMessage(blogMessage, "Error al guardar la entrada.", "error");
      return;
    }
    setMessage(blogMessage, "Entrada publicada correctamente.", "success");
  }

  loadBlogPosts();
  closeBlogModal();
});

galleryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(galleryMessage, "Guardando imagen...", "loading");

  const formData = new FormData(galleryForm);
  const file = formData.get("imagen");
  const imageId =
    galleryIdInput instanceof HTMLInputElement ? galleryIdInput.value : formData.get("image_id");
  const existingImage = galleryForm.getAttribute("data-image");
  const existingOrder = galleryForm.getAttribute("data-featured-order");

  let imageUrl = existingImage || null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage(galleryMessage, "La imagen excede 8MB. Usa una imagen más liviana.", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMessage(galleryMessage, "Formato no permitido. Sube solo imágenes.", "error");
      return;
    }
    try {
      setMessage(galleryMessage, "Comprimiendo imagen…", "loading");
      const optimized = await compressImage(file, { maxWidth: 1200, quality: 0.80 });
      setMessage(galleryMessage, "Subiendo imagen…", "loading");
      imageUrl = await uploadImage(optimized, GALLERY_FOLDER);
      if (existingImage) await removeImageByUrl(existingImage);
    } catch (error) {
      setMessage(galleryMessage, "Error al subir la imagen. Intenta nuevamente.", "error");
      return;
    }
  }

  if (!imageUrl) {
    setMessage(galleryMessage, "Selecciona una imagen para continuar.", "error");
    return;
  }

  const featuredInput = galleryForm?.querySelector("input[name='destacada']");
  const isFeatured = featuredInput instanceof HTMLInputElement && featuredInput.checked;
  const payload = {
    url_publica: imageUrl,
    alt_text: formData.get("alt"),
    descripcion: formData.get("titulo"),
    detalle: formData.get("detalle"),
    destacada: isFeatured,
    destacada_orden: null,
  };

  if (payload.destacada) {
    if (existingOrder) payload.destacada_orden = Number(existingOrder);
    else payload.destacada_orden = await getNextFeaturedOrder();
  }

  if (imageId) {
    const { data: updatedRows, error } = await supabase
      .from("imagenes")
      .update(payload)
      .eq("id", imageId)
      .select("id");
    if (error) {
      setMessage(galleryMessage, `Error al actualizar la imagen: ${error.message}`, "error");
      return;
    }
    if (!updatedRows || updatedRows.length === 0) {
      setMessage(galleryMessage, "No se pudo actualizar (permiso o RLS).", "error");
      return;
    }
    setMessage(galleryMessage, "Imagen actualizada correctamente.", "success");
  } else {
    const { data: insertedRows, error } = await supabase.from("imagenes").insert(payload).select("id");
    if (error) {
      setMessage(galleryMessage, `Error al guardar la imagen: ${error.message}`, "error");
      return;
    }
    if (!insertedRows || insertedRows.length === 0) {
      setMessage(galleryMessage, "No se pudo guardar (permiso o RLS).", "error");
      return;
    }
    setMessage(galleryMessage, "Imagen publicada en la galería.", "success");
  }

  loadGalleryItems();
  closeGalleryModal();
});

blogCancel?.addEventListener("click", () => {
  closeBlogModal();
});

galleryCancel?.addEventListener("click", () => {
  closeGalleryModal();
});

blogNew?.addEventListener("click", () => {
  resetBlogForm();
  setMessage(blogMessage, "", "info");
  openBlogModal("new");
});

galleryNew?.addEventListener("click", () => {
  resetGalleryForm();
  setMessage(galleryMessage, "", "info");
  openGalleryModal("new");
});

blogModal?.addEventListener("click", (event) => {
  if (event.target === blogModal) closeBlogModal();
});

galleryModal?.addEventListener("click", (event) => {
  if (event.target === galleryModal) closeGalleryModal();
});

document.querySelectorAll(".modal-close").forEach((button) => {
  button.addEventListener("click", () => {
    closeBlogModal();
    closeGalleryModal();
  });
});

galleryFeaturedOnly?.addEventListener("change", () => {
  loadGalleryItems();
});

galleryFeaturedSave?.addEventListener("click", () => {
  saveFeaturedLimit();
});

const enableGalleryDrag = () => {
  if (!galleryList) return;
  const cards = Array.from(galleryList.querySelectorAll(".list-card"));
  let draggedCard = null;

  const handleDragOver = (event, target) => {
    event.preventDefault();
    if (!draggedCard || draggedCard === target) return;
    const rect = target.getBoundingClientRect();
    const shouldInsertAfter = event.clientY - rect.top > rect.height / 2;
    galleryList.insertBefore(draggedCard, shouldInsertAfter ? target.nextSibling : target);
  };

  const persistOrder = async () => {
    const orderedCards = Array.from(galleryList.querySelectorAll(".list-card"));
    if (!orderedCards.length) return;
    const updates = orderedCards.map((card, index) => ({
      id: Number(card.dataset.id),
      destacada_orden: index + 1,
    }));
    const { error } = await supabase.from("imagenes").upsert(updates, { onConflict: "id" });
    if (error) {
      showToast(`No se pudo actualizar el orden: ${error.message}`, "error");
      return;
    }
    showToast("Orden actualizado.", "success");
  };

  cards.forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      draggedCard = card;
      card.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", "");
    });

    card.addEventListener("dragend", async () => {
      card.classList.remove("is-dragging");
      draggedCard = null;
      await persistOrder();
    });

    card.addEventListener("dragover", (event) => handleDragOver(event, card));
  });
};

updateBlogContentPreview(blogContentInput?.value ?? "");

await loadBlogPosts();
await loadGalleryItems();
await loadFeaturedLimit();
