// Hornea el dataset en el build: lee v_analisis_postulaciones de Supabase y escribe
// data/postulaciones.json en formato columnar (contrato en lib/dataset.ts).
//
// Corre como `prebuild`, asi que en Vercel se ejecuta solo. Si no encuentra
// credenciales NO falla el build: copia data/postulaciones.ejemplo.json y marca
// es_ejemplo:true, para que cualquiera pueda levantar el panel sin acceso a la base.
//
// La service key vive solo aqui, en el build. Nunca con prefijo NEXT_PUBLIC_.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const SALIDA = join(RAIZ, 'data', 'postulaciones.json');
const EJEMPLO = join(RAIZ, 'data', 'postulaciones.ejemplo.json');

const URL_BASE = process.env.CONV_SUPABASE_URL;
const KEY = process.env.CONV_SUPABASE_SERVICE_ROLE_KEY;
const VISTA = 'v_analisis_postulaciones';
const PAGINA = 1000;

const SIN_DATO = 'Sin dato';

// Campos numericos y booleanos; todo lo demas se trata como categorico o multivalor.
const NUMERICOS = new Set([
  'edad', 'estrato', 'personas_nucleo', 'indice_activos',
  'promedio_pct', 'horas_min', 'horas_max', 'pct_avance', 'cursos_aprobados',
]);
const BOOLEANOS = new Set([
  'tiene_internet', 'aplico_antes_jc', 'fue_beneficiario_antes',
  'enrutado_fuera_cobertura', 'seleccionado', 'retirado',
]);
const MULTIVALOR = new Set(['segmentos', 'ocupaciones', 'como_se_entero']);
const OMITIR = new Set(['id_publico']);

function usarEjemplo(motivo) {
  console.warn(`[dataset] ${motivo} — se usa data/postulaciones.ejemplo.json`);
  const ej = JSON.parse(readFileSync(EJEMPLO, 'utf8'));
  ej.es_ejemplo = true;
  ej.generado_en = new Date().toISOString();
  escribir(ej);
}

function escribir(obj) {
  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(obj));
  const mb = (Buffer.byteLength(JSON.stringify(obj)) / 1024 / 1024).toFixed(2);
  console.log(`[dataset] ${obj.total} filas · ${mb} MB · ejemplo=${obj.es_ejemplo}`);
}

async function leerTodo() {
  const filas = [];
  for (let offset = 0; ; offset += PAGINA) {
    // El `order` explicito NO es decorativo: sin el, PostgREST no garantiza orden
    // estable entre paginas y se repiten o se pierden filas (incidente 2026-09-08).
    const url = `${URL_BASE}/rest/v1/${VISTA}?select=*&order=id_publico.asc&limit=${PAGINA}&offset=${offset}`;
    const resp = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!resp.ok) throw new Error(`${VISTA}: HTTP ${resp.status} ${await resp.text()}`);
    const lote = await resp.json();
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

function comprimir(filas) {
  const nombres = Object.keys(filas[0]).filter((c) => !OMITIR.has(c));
  const campos = {};
  const columnas = {};

  for (const campo of nombres) {
    if (NUMERICOS.has(campo)) {
      const col = filas.map((f) => (f[campo] === null ? null : Number(f[campo])));
      const reales = col.filter((v) => v !== null);
      campos[campo] = {
        tipo: 'num',
        etiqueta: campo,
        min: reales.length ? Math.min(...reales) : 0,
        max: reales.length ? Math.max(...reales) : 0,
      };
      columnas[campo] = col;
    } else if (BOOLEANOS.has(campo)) {
      campos[campo] = { tipo: 'bool', etiqueta: campo };
      columnas[campo] = filas.map((f) => (f[campo] ? 1 : 0));
    } else if (MULTIVALOR.has(campo)) {
      const dicc = new Map();
      const col = filas.map((f) => {
        const brutos = Array.isArray(f[campo]) && f[campo].length ? f[campo] : [SIN_DATO];
        return brutos.map((v) => {
          const s = String(v);
          if (!dicc.has(s)) dicc.set(s, dicc.size);
          return dicc.get(s);
        });
      });
      campos[campo] = { tipo: 'multi', etiqueta: campo, valores: [...dicc.keys()] };
      columnas[campo] = col;
    } else {
      const dicc = new Map();
      const col = filas.map((f) => {
        // Un null categorico se vuelve una categoria contable, no un hueco: si se
        // cayera de la faceta, los segmentos dejarian de sumar el universo.
        const s = f[campo] === null || f[campo] === '' ? SIN_DATO : String(f[campo]);
        if (!dicc.has(s)) dicc.set(s, dicc.size);
        return dicc.get(s);
      });
      campos[campo] = { tipo: 'cat', etiqueta: campo, valores: [...dicc.keys()] };
      columnas[campo] = col;
    }
  }

  return {
    version: 1,
    generado_en: new Date().toISOString(),
    es_ejemplo: false,
    total: filas.length,
    campos,
    columnas,
  };
}

async function main() {
  if (!URL_BASE || !KEY) {
    if (!existsSync(EJEMPLO)) throw new Error('Sin credenciales y sin archivo de ejemplo');
    return usarEjemplo('Falta CONV_SUPABASE_URL o CONV_SUPABASE_SERVICE_ROLE_KEY');
  }
  try {
    const filas = await leerTodo();
    if (!filas.length) return usarEjemplo(`${VISTA} devolvio 0 filas`);
    escribir(comprimir(filas));
  } catch (e) {
    if (process.env.VERCEL) throw e;  // en produccion, fallar fuerte
    usarEjemplo(`Error leyendo Supabase: ${e.message}`);
  }
}

main();
