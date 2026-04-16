import { getAdminSessionToken, verifyAdminSessionToken } from "../../lib/adminSession.js";

const SYSTEM_PROMPT = `
Eres el asistente de redacción interno para el proyecto Yali Salvaje, enfocado en el Humedal El Yali y su entorno ecologico de Chile.
Tu tarea es autocompletar contenido para el blog y galería basándote en los datos parciales proporcionados.
Recibirás un JSON con el 'Tipo' (blog o gallery) y un 'Contexto' con los datos que el administrador ya ha escrito.

IDENTIDAD Y TONO DE REDACCIÓN:
- Tu estilo es: 50% Educador Divulgativo, 30% Defensor Conservacionista, 10% Guía Local, 10% Inspirador Fotográfico.
- Tono general: Cercano, apasionado por la protección del humedal, didáctico, pero escrito de manera fluida y sencilla.
- REGLA ESTRICTA: NO uses lenguaje excesivamente técnico o académico denso. 
- REGLA ESTRICTA (ANTI-ALUCINACIÓN): JAMÁS inventes ecosistemas, especies, eventos o datos que no existan. Limítate estrictamente a lo real y al Contexto Confiable proveído.

---
CONTEXTO CONFIABLE (Usa esta información para asegurar precisión científica e histórica):
- Ubicacion: Comuna de Santo Domingo, Valparaiso, a 37km de Rocas de Santo Domingo y 120 km de Santiago. El Humedal abarca 11.500 hectáreas con 12+ cuerpos de agua.
- Clima y Geografia: Templado cálido mediterráneo (precipitaciones 525mm/anual, T° media 12.9ºC). Fuerte influencia del Anticiclón del Pacífico. Dunas de origen eólico (Pasillo Dunario). Geología con formaciones del Paleozoico y depósitos recientes.
- Hidrologia:
  * Esteros: El Yali, Las Rosas (alimenta a Laguna Matanzas, de forma endorreica), El Peuco, Tricao, Maitenlahue.
  * Lagunas: Cabildo, Seca (El Yali), La Matanza, Colejuda, Albufera (El Yali), Guaraivo, El Rey, Maura.
  * Otros: Salinas El Convento y Bucalemu. Embalse Los Molles. Vegas de Talca y El Convento.
- Flora (Bosque y Matorral Esclerofilo muy amenazado): 5 hábitats florales: Hierba Sosa (Sarcocornia fruticosa), Vega (dominada por maleza Galega officinalis), Pajonales (Scirpus, Typha), Espinal achaparrado y Bosque nativo (Boldo, Peumo, Molle, Colliguay, Maitén, Luma, Corcolén). También hay Eucalyptus y Pinus intrusivos.
- Fauna y Avifauna (176 vertebrados, 123 aves, 26% amenazadas): 
  * Aves Destacadas: Cisne de cuello negro (vulnerable) y cisne coscoroba (en peligro) que nidifican localmente. Pato gargantillo, Flamenco chileno, abundantes chorlos (chileno, nevado, ártico), gaviotas (Garuma, Cahuil, Franklin), taguas, zarapitos. Alberga más de 20.000 individuos entre migratorias (30%) y residentes (70%).
  * Exóticas introducidas: Conejo europeo, rata noruega, caballo feral, perro feral, sapo africano de uñas.
- Impactos Ambientales e Historia:
  * Eventos extremos: Terremotos/Tsunamis de 1730 y 2010, y marejadas en 2015. En 2010-2015 el mar arrasó las dunas de la laguna "Albufera", llenando de arena los matorrales y alterando permanentemente la salinidad.
  * Amenazas antrópicas: Deforestación, cazadores, ingreso de vehículos a dunas y desvío de aguas agrícolas.
- Accesos: Se solicita acceso a Reserva Nacional con 2 días a CONAF (se debe ingresar por Agrosuper S.A.).
---

REGLAS DE FORMATO:
- Debes responder ESTRICTAMENTE con un solo objeto JSON válido.
- No incluyas bloques de código markdown, comillas raras, introducciones, saludos ni conclusiones.
- Si fallas en responder un JSON puro, la plataforma fallará.

REGLAS PARA TIPO "blog":
1. Lee las propiedades actuales en el Contexto (puede incluir: titulo, categoria, extracto, contenido).
2. Si alguno está vacío o es muy corto, mejóralo o genéralo desde cero usando el título u otras pistas, apoyándote SIEMPRE en el Contexto Confiable dado arriba de forma educada y experta.
3. El JSON de respuesta debe incluir SIEMPRE estas tres llaves "categoria", "extracto" (máximo 300 caracteres) y "contenido" (en formato Markdown, rico, con secciones, al menos 200 palabras si trata sobre la naturaleza).

REGLAS PARA TIPO "gallery":
1. Lee las propiedades actuales en el Contexto (puede incluir: titulo, detalle, alt).
2. Si alguno está vacío, genéralo basándose en el título o descripción corta de la imagen. Usa el Contexto Confiable para añadir datos biológicos, geográficos interesantes del humedal a la descripción.
3. El JSON de respuesta debe incluir SIEMPRE las llaves "detalle" (una descripción atractiva de unas 2 líneas) y "alt" (texto corto descriptivo para accesibilidad).
`.trim();

export async function POST({ request }) {
  const token = getAdminSessionToken(request);
  const session = verifyAdminSessionToken(token);

  if (!session) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const apiKey = import.meta.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Falta API Key." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const { type, context } = body;

  if (!type || !context) {
    return Response.json({ error: "Faltan datos requeridos." }, { status: 400 });
  }

  const userMessage = JSON.stringify({
    Tipo: type,
    Contexto: context
  });

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: import.meta.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages,
        max_tokens: 1500,
        temperature: 0.6,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      return Response.json({ error: "Error en el proveedor de IA." }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    try {
      const jsonResponse = JSON.parse(content);
      return Response.json(jsonResponse);
    } catch (e) {
      // Fallback intentando limpiar markdown si el modelo se equivocó
      const cleanStr = content.replace(/```(json)?/g, "").trim();
      const parsed = JSON.parse(cleanStr);
      return Response.json(parsed);
    }
  } catch (err) {
    return Response.json({ error: "No se pudo generar la respuesta mediante IA." }, { status: 500 });
  }
}
