import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
};

const inputPath = getArg("--input", "");
const bucket = getArg("--bucket", "media");
const folder = getArg("--folder", "galeria");
const width = Number(getArg("--width", "1400"));
const quality = Number(getArg("--quality", "72"));
const format = getArg("--format", "webp").toLowerCase();
const outputDir = getArg("--output", path.join(__dirname, "..", "tmp", "optimized"));
const mapPath = getArg("--map", path.join(__dirname, "..", "tmp", "image-map.json"));

if (!inputPath) {
  console.log("Uso: node scripts/optimize-upload.mjs --input ./ruta/imagen.jpg --folder blog|galeria");
  process.exit(1);
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const resolveFiles = (input) => {
  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    return fs.readdirSync(input)
      .filter((file) => /\.(jpe?g|png|webp|avif)$/i.test(file))
      .map((file) => path.join(input, file));
  }
  return [input];
};

const toSafeName = (file) =>
  path.basename(file, path.extname(file))
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const buildOutputPath = (file) => path.join(outputDir, `${toSafeName(file)}.${format}`);

const optimize = async (file) => {
  const output = buildOutputPath(file);
  const pipeline = sharp(file).resize({ width, withoutEnlargement: true });
  if (format === "avif") {
    await pipeline.avif({ quality }).toFile(output);
  } else {
    await pipeline.webp({ quality }).toFile(output);
  }
  return output;
};

const uploadFiles = async (files, originals) => {
  const mappings = {};
  if (!supabaseUrl || !serviceRoleKey) {
    console.log("Faltan PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Solo se optimizaron archivos.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const original = originals[i];
    const fileName = path.basename(file);
    const storagePath = `${folder}/${Date.now()}-${fileName}`;
    const data = fs.readFileSync(file);
    const { error } = await supabase.storage.from(bucket).upload(storagePath, data, {
      contentType: format === "avif" ? "image/avif" : "image/webp",
      upsert: false,
      cacheControl: "31536000",
    });

    if (error) {
      console.log(`Error subiendo ${fileName}: ${error.message}`);
    } else {
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      console.log(`Subida OK: ${publicData.publicUrl}`);
      mappings[original] = publicData.publicUrl;
    }
  }

  if (Object.keys(mappings).length > 0) {
    fs.writeFileSync(mapPath, JSON.stringify(mappings, null, 2));
    console.log(`Mapa guardado en: ${mapPath}`);
  }
};

const run = async () => {
  const files = resolveFiles(inputPath);
  const optimized = [];
  const originals = [];

  for (const file of files) {
    const output = await optimize(file);
    console.log(`Optimizado: ${output}`);
    optimized.push(output);
    originals.push(file);
  }

  await uploadFiles(optimized, originals);
};

run();
