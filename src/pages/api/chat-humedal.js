const MAX_QUESTION_LENGTH = 600;
const MAX_HISTORY_MESSAGES = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const PROVIDER_TIMEOUT_MS = 20000;

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
- Mejor horario: temprano por la manana (al amanecer o primera hora).
- El acceso depende del sector (zonas publicas y zonas protegidas).
- Recomendacion de ruta: buscar "Reserva Nacional El Yali" en Google Maps.

REGLAS DE RESPUESTA
- Responde claro, preciso, util y breve.
- No inventes datos. Si falta certeza: "No tengo ese dato confirmado."
- No saludes en cada respuesta; saluda solo si el usuario saluda o en el primer turno.
- Incluye maximo 1 pregunta de seguimiento cuando ayude.
- Usa listas cuando sea util para organizar informacion con varios elementos.

ALCANCE
- Solo temas relacionados con Humedal El Yali, Reserva Nacional El Yali, fauna, fotografia y Yali Salvaje.
- Si preguntan fuera de alcance, responde exactamente:
"Soy el asistente de Yali Salvaje y solo puedo responder sobre el Humedal El Yali y temas relacionados."
`.trim();

const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: typeof item.text === "string" ? item.text.trim() : "",
    }))
    .filter((item) => item.content.length > 0 && item.content.length <= MAX_QUESTION_LENGTH)
    .slice(-MAX_HISTORY_MESSAGES);
};

const getClientIp = (request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
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
  return item.count > RATE_LIMIT_MAX_REQUESTS;
};

const isSameOrigin = (request) => {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
};

const isScheduleQuestion = (text) => {
  return /(horario[s]?\s+de\s+(atenci[oó]n|visita|apertura)|cu[aá]ndo\s+abre|a\s+qu[eé]\s+hora\s+abre|est[aá]\s+(abierto|cerrado)|d[ií]as?\s+de\s+(atenci[oó]n|apertura)|\bhorarios?\b|\bapertura\b)/i.test(text);
};

export async function POST({ request }) {
  const apiKey = import.meta.env.GROQ_API_KEY;

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
      { error: "Falta configurar GROQ_API_KEY en el servidor." },
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
        "Si quieres, te ayudo con el mejor horario para observacion de aves y como llegar.",
    });
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  let response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: import.meta.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages,
        stream: true,
        max_tokens: 800,
        temperature: 0.2,
      }),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === "AbortError";
    return Response.json(
      { error: isTimeout ? "El asistente no respondio a tiempo." : "No fue posible conectarse con el asistente." },
      { status: 502 },
    );
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg = errorData?.error?.message || "No fue posible generar una respuesta.";
    console.error("Error Groq:", response.status, errorData);
    return Response.json({ error: msg }, { status: 502 });
  }

  // Pipe Groq SSE → client SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const send = (obj) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") { send({ done: true }); break; }

            let parsed;
            try { parsed = JSON.parse(raw); } catch { continue; }

            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) send({ delta });

            const finishReason = parsed?.choices?.[0]?.finish_reason;
            if (finishReason === "length") send({ truncated: true });
          }
        }
        send({ done: true });
      } catch {
        send({ error: "Error al leer la respuesta del asistente." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
