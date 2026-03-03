const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_QUESTION_LENGTH = 600;
const MAX_HISTORY_MESSAGES = 10;
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES_PER_MODEL = 1;
const PROVIDER_TIMEOUT_MS = 18000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitStore = globalThis.__chatRateLimitStore ?? new Map();
globalThis.__chatRateLimitStore = rateLimitStore;

const SYSTEM_PROMPT = `
Eres el asistente virtual oficial de Yali Salvaje.
Siempre respondes en español.

OBJETIVO
- Responder sobre Humedal El Yali, Reserva Nacional El Yali, biodiversidad, acceso, fotografia, turismo y conservacion.
- Educar, informar y ayudar a visitantes y fotografos de naturaleza.

IDENTIDAD
- Representas a Yali Salvaje: fotografia, educacion ambiental y difusion del Humedal El Yali.
- Tono: amigable, natural, experto en naturaleza, educativo.
- Evita tecnicismos innecesarios.

CONTEXTO CONFIABLE
- Ubicacion: comuna de Santo Domingo, provincia de San Antonio, Region de Valparaiso, Chile.
- Distancia aproximada desde Santiago: 120 km.
- Coordenadas aproximadas: 33.733 S, 71.650 O.
- Humedal El Yali: ecosistema completo de aprox. 11.500 ha.
- Reserva Nacional El Yali: 520 ha dentro del humedal, creada en 1996 y administrada por CONAF.
- Sitio Ramsar de importancia internacional.
- Alta biodiversidad: mas de 115 especies de aves registradas y aprox. 176 especies de vertebrados.
- Proporciona zonas de alimentacion, nidificacion y descanso para aves migratorias.
- Clima mediterraneo con influencia oceanica: temperatura media anual 13,2 C y precipitacion anual 481 mm (lluvias sobre todo entre mayo y agosto).

DIFERENCIA CLAVE
- Humedal El Yali = ecosistema completo.
- Reserva Nacional El Yali = parte protegida dentro del humedal.

CUERPOS DE AGUA IMPORTANTES
- Lagunas: La Matanza, Colejuda, Cabildo, Guaraivo, El Rey, Maura, Seca, Albufera El Yali.
- Esteros: El Yali, Tricao, Maitenlahue, Las Rosas, El Peuco.
- Salinas: El Convento y Bucalemu.

BIODIVERSIDAD DESTACADA
- Aves: flamenco chileno, cisne de cuello negro, cisne coscoroba, gaviota cahuil, gaviota de Franklin, garza cuca, yeco, perrito, tagua, siete colores.
- Mamiferos: zorro culpeo, zorro chilla, coipo, degu, cururo, huina, quique.
- Anfibios: rana grande chilena, sapo de rulo, sapo de cuatro ojos.
- Referencia general: ~30% migratorias y ~70% residentes.

VISITA Y FOTOGRAFIA
- Actividades: observacion de aves, fotografia de naturaleza, turismo ecologico, educacion ambiental.
- Se puede visitar todo el ano, con buen rendimiento de aves en invierno y primavera.
- Mejor horario: temprano por la manana.
- El acceso depende del sector (zonas publicas y zonas protegidas).
- Recomendacion de ruta: buscar "Reserva Nacional El Yali" en Google Maps.

REGLAS DE RESPUESTA
- Responde claro, preciso, util y breve.
- No inventes datos.
- Si falta certeza: "No tengo ese dato confirmado."
- Si no hay informacion confiable sobre dias/horarios exactos o tarifas exactas, dilo explicitamente.
- No saludes en cada respuesta; saluda solo si el usuario saluda o en el primer turno.
- Incluye maximo 1 pregunta de seguimiento cuando ayude.

ALCANCE
- Solo temas relacionados con Humedal El Yali, Reserva Nacional El Yali, fauna, fotografia y Yali Salvaje.
- Si preguntan fuera de alcance, responde exactamente:
"Soy el asistente de Yali Salvaje y solo puedo responder sobre el Humedal El Yali y temas relacionados."
`;


const normalizeRole = (role) => (role === "assistant" ? "model" : "user");

const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const role = item.role === "assistant" ? "assistant" : "user";
      const text = typeof item.text === "string" ? item.text.trim() : "";
      return { role, text };
    })
    .filter((item) => item.text.length > 0 && item.text.length <= MAX_QUESTION_LENGTH)
    .slice(-MAX_HISTORY_MESSAGES);
};

const extractText = (responseData) => {
  const candidates = Array.isArray(responseData?.candidates) ? responseData.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .filter((part) => typeof part?.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
};

const isTruncatedByProvider = (responseData) => {
  const candidates = Array.isArray(responseData?.candidates) ? responseData.candidates : [];
  return candidates.some((candidate) => {
    const reason = String(candidate?.finishReason || "").toUpperCase();
    return reason === "MAX_TOKENS" || reason === "LENGTH";
  });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (response) => {
  const retryAfter = response?.headers?.get("retry-after");
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 5000);
  }
  return null;
};

const isScheduleQuestion = (text) => {
  const normalized = String(text || "").toLowerCase();
  return /(dias|días|horario|horarios|abierta|abierto|abre|apertura)/i.test(normalized);
};

const isLikelyIncompleteAnswer = (text) => {
  const value = String(text || "").trim();
  if (!value) return true;
  if (value.length < 18) return true;
  const hasClosingPunctuation = /[.!?…)"']$/.test(value);
  const endsWithConnector = /\b(el|la|los|las|de|del|y|o|que|para|por|en|con|humedal)\s*$/i.test(value);
  return !hasClosingPunctuation && endsWithConnector;
};

const getClientIp = (request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return request.headers.get("x-nf-client-connection-ip") || "unknown";
};

const checkRateLimit = (request) => {
  const now = Date.now();
  const key = getClientIp(request);
  const item = rateLimitStore.get(key);

  if (!item || now > item.expiresAt) {
    rateLimitStore.set(key, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  item.count += 1;
  rateLimitStore.set(key, item);
  return item.count > RATE_LIMIT_MAX_REQUESTS;
};

const isSameOrigin = (request) => {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  return origin === url.origin;
};

export async function POST({ request }) {
  const apiKey = import.meta.env.GEMINI_API_KEY || import.meta.env.GOOGLE_API_KEY;
  const configuredModel = import.meta.env.GEMINI_MODEL || DEFAULT_MODEL;

  if (!isSameOrigin(request)) {
    return Response.json({ error: "Origen no permitido." }, { status: 403 });
  }

  if (checkRateLimit(request)) {
    return Response.json(
      { error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." },
      { status: 429 },
    );
  }

  if (!apiKey) {
    return Response.json(
      { error: "Falta configurar GEMINI_API_KEY (o GOOGLE_API_KEY) en el servidor." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
  const history = sanitizeHistory(body?.history);

  if (!userMessage) {
    return Response.json({ error: "La pregunta esta vacia." }, { status: 400 });
  }

  if (userMessage.length > MAX_QUESTION_LENGTH) {
    return Response.json(
      { error: `La pregunta supera el maximo de ${MAX_QUESTION_LENGTH} caracteres.` },
      { status: 400 },
    );
  }

  if (isScheduleQuestion(userMessage)) {
    return Response.json({
      answer:
        "No tengo ese dato confirmado sobre dias u horarios de apertura del Humedal El Yali. " +
        "Para evitar informacion incorrecta, revisa canales oficiales de administracion local y Yali Salvaje. " +
        "Si quieres, te ayudo con mejor horario para observacion de aves y como llegar.",
    });
  }

  const contents = [
    ...history.map((item) => ({
      role: normalizeRole(item.role),
      parts: [{ text: item.text }],
    })),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  const modelsToTry = [configuredModel, ...FALLBACK_MODELS].filter(
    (value, index, arr) => value && arr.indexOf(value) === index,
  );
  let aiResponse = null;
  let lastErrorData = null;
  const attemptErrors = [];

  for (const model of modelsToTry) {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
      ":generateContent";

    for (let retry = 0; retry <= MAX_RETRIES_PER_MODEL; retry += 1) {
      let response;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
            contents,
            generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 520,
            topP: 0.9,
            topK: 40,
          },
        }),
        });
      } catch (error) {
        clearTimeout(timeoutId);
        const isTimeout = error instanceof Error && error.name === "AbortError";
        attemptErrors.push({
          model,
          status: isTimeout ? 408 : 0,
          message: isTimeout ? "Provider timeout" : String(error?.message || error),
        });
        if (retry < MAX_RETRIES_PER_MODEL) {
          await sleep(900 + retry * 500);
          continue;
        }
        break;
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.ok) {
        aiResponse = response;
        break;
      }

      const errorData = await response.json().catch(() => ({}));
      lastErrorData = errorData;
      const providerMessage = String(errorData?.error?.message || "");
      const notFoundModel =
        response.status === 404 || providerMessage.includes("is not found for API version");
      attemptErrors.push({ model, status: response.status, message: providerMessage });

      if (notFoundModel) {
        break;
      }

      const shouldRetry = RETRYABLE_STATUS.has(response.status) && retry < MAX_RETRIES_PER_MODEL;
      if (shouldRetry) {
        const delayMs = parseRetryAfterMs(response) ?? 900 + retry * 500;
        await sleep(delayMs);
        continue;
      }

      if (!RETRYABLE_STATUS.has(response.status)) {
        aiResponse = response;
      }
      break;
    }

    if (aiResponse) break;
  }

  if (!aiResponse) {
    console.error("Error Gemini chat-humedal (sin respuesta util):", attemptErrors);
    return Response.json(
      { error: "No fue posible conectarse con Gemini en este momento." },
      { status: 502 },
    );
  }

  if (!aiResponse.ok) {
    const errorData = lastErrorData || (await aiResponse.json().catch(() => ({})));
    const providerMessage = errorData?.error?.message;

    console.error("Error Gemini chat-humedal:", aiResponse.status, errorData);

    if (aiResponse.status === 429) {
      const quotaDetail = typeof providerMessage === "string" ? ` Detalle: ${providerMessage}` : "";
      return Response.json(
        {
          error:
            "El asistente no esta disponible por limite temporal o de cuota en Gemini. Revisa " +
            "free tier, limites por minuto y cuota diaria del proyecto en Google AI Studio." +
            quotaDetail,
        },
        { status: 429 },
      );
    }

    if (aiResponse.status === 401 || aiResponse.status === 403) {
      return Response.json(
        { error: "No se pudo autenticar con Gemini. Revisa GEMINI_API_KEY o GOOGLE_API_KEY." },
        { status: 502 },
      );
    }

    return Response.json(
      { error: providerMessage || "No fue posible generar una respuesta en este momento." },
      { status: 502 },
    );
  }

  const data = await aiResponse.json();
  const answer = extractText(data);
  const wasTruncated = isTruncatedByProvider(data);

  if (!answer || isLikelyIncompleteAnswer(answer) || wasTruncated) {
    return Response.json({
      answer:
        "No pude generar una respuesta completa en este intento. " +
        "Puedes repetir la pregunta y te respondere en formato corto y directo para evitar cortes.",
    });
  }

  return Response.json({ answer });
}
