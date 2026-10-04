# 🌿 Yali Salvaje

Sitio web dedicado a mostrar la belleza natural del **Humedal El Yali**, su fauna, flora y los esfuerzos por su conservación.  
Una galería viva de fotos, experiencias y registros de este ecosistema único ubicado en la Región de Valparaíso, Chile.


---

## 🖼️ ¿Qué puedes encontrar?

- 📸 Galería de imágenes con **scroll infinito**  
- 🐦 Registros de aves, mamíferos y flora nativa  
- 📍 Mapa de ubicación del humedal  
- 🌱 Información sobre conservación y educación ambiental  
- 🧑‍💻 Código abierto y en constante evolución  

---

## 🚀 Tecnologías usadas

- [Astro](https://astro.build/)
- [JavaScript](https://developer.mozilla.org/es/docs/Web/JavaScript)
- CSS Modules / Tailwind CSS
- Google Gemini API (chat del humedal)

---

## 🤖 Chat IA del Humedal

El sitio incluye un chat en modal para responder preguntas sobre el Humedal El Yali.

Variables necesarias:

- `GEMINI_API_KEY`
- `GOOGLE_API_KEY` (alternativa si no usas `GEMINI_API_KEY`)
- `GEMINI_MODEL` (opcional, por defecto `gemini-2.5-flash`)

Si cambias variables de entorno en local, reinicia `npm run dev`.

## Mantención de Supabase Free

Netlify ejecuta `netlify/functions/supabase-keepalive.mjs` los lunes y jueves a
las 12:17 UTC. La función realiza una lectura mínima de `blog_posts` para
mantener actividad real en la base de datos. Reutiliza `PUBLIC_SUPABASE_URL` y
`PUBLIC_SUPABASE_ANON_KEY`; ambas deben estar configuradas en el entorno de
producción de Netlify. Después de publicar, confirma que la función aparezca con
la etiqueta **Scheduled** y ejecuta **Run now** una vez para validar la conexión.

---

## 🛠️ Instalación local

```bash
git clone https://github.com/tu-usuario/yali-salvaje.git
cd yali-salvaje
npm install
cp .env.example .env
npm run dev
```

Completa `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` en `.env` con los
valores configurados en Netlify antes de iniciar el servidor. Sin ellos no se
pueden cargar las fotografías, entradas ni ajustes guardados en Supabase.
