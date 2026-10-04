// src/lib/supabaseClient.js

import { createClient } from '@supabase/supabase-js';

// Astro carga estas variables desde un archivo .env local o desde Netlify.

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Verifica si las variables están definidas para evitar errores
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY. Copia .env.example a .env y completa los valores del proyecto Supabase.",
  );
}

const storage = typeof window !== "undefined" ? window.sessionStorage : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage,
  },
});
