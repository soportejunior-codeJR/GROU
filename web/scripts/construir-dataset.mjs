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

// Cargar .env.local a mano. Next inyecta las variables en SU build, pero este
// script corre como `node scripts/...` en el prebuild, fuera de ese contexto: sin
// esto, un `npm run build` local no encuentra las credenciales, cae al archivo de
// ejemplo y PISA el dataset real de 24.203 filas con 300 sinteticas. En Vercel no
// se nota porque alli las variables vienen del entorno de la plataforma.
function cargarEnvLocal() {
  for (const archivo of ['.env.local', '.env']) {
    const ruta = join(RAIZ, archivo);
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const l = linea.trim();
      if (!l || l.startsWith('#') || !l.includes('=')) continue;
      const i = l.indexOf('=');
      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}
cargarEnvLocal();

const URL_BASE = process.env.CONV_SUPABASE_URL;
const KEY = process.env.CONV_SUPABASE_SERVICE_ROLE_KEY;
const VISTA = 'v_analisis_postulaciones';
const PAGINA = 500; // paginas mas pequenas: con 1000 la vista de 52 columnas devolvia 504

const SIN_DATO = 'Sin dato';

// Campos numericos y booleanos; todo lo demas se trata como categorico o multivalor.
const NUMERICOS = new Set([
  // id_publico va aqui obligatoriamente. Si cae en la rama categorica, lo que se
  // guarda son INDICES DE DICCIONARIO (0,1,2...) en vez de los ids, y el export de
  // datos personales pediria las personas equivocadas. Ademas un diccionario de
  // 24.203 cadenas unicas engorda el archivo sin ganar nada.
  'id_publico',
  'edad', 'estrato', 'personas_nucleo', 'indice_activos', 'cursos_inscritos',
  'promedio_pct', 'horas_min', 'horas_max', 'pct_avance', 'cursos_aprobados',
]);
// OJO: esta lista dice que campos PODRIAN ser booleanos, no que lo sean. El tipo
// real se decide mirando el dato (ver esBooleanoDeVerdad), porque la vista devuelve
// varios de estos como TEXTO de tres valores: 'si' / 'no' / 'no_aplica'.
//
// Tratarlos como booleanos con `f[campo] ? 1 : 0` los falsea por completo: en
// JavaScript cualquier cadena no vacia es verdadera, asi que 'no' se convierte en
// 1 = "Si". Eso dejo cuatro filtros marcando "Si" para las 24.203 personas
// —tiene_internet, aplico_antes_jc, fue_beneficiario_antes y retirado— hasta que
// el cliente lo noto mirando el panel. seleccionado y enrutado_fuera_cobertura se
// salvaron solo porque la vista SI los devuelve como booleanos reales.
//
// Por eso ya no se confia en la lista: se mira el dato.
const BOOLEANOS = new Set([
  'tiene_internet', 'aplico_antes_jc', 'fue_beneficiario_antes',
  'enrutado_fuera_cobertura', 'seleccionado', 'retirado',
]);

/** true solo si TODOS los valores no nulos son booleanos de verdad. */
function esBooleanoDeVerdad(filas, campo) {
  let vistos = 0;
  for (const f of filas) {
    const v = f[campo];
    if (v === null || v === undefined) continue;
    if (typeof v !== 'boolean') return false;
    vistos++;
  }
  return vistos > 0;
}
const MULTIVALOR = new Set(['segmentos', 'ocupaciones', 'como_se_entero']);
// id_publico SÍ viaja en el dataset. Antes se omitía y la interfaz lo reconstruía
// como (posición de fila + 1), lo cual solo da bien mientras los ids sean contiguos
// desde 1 y el build consulte con order=id_publico.asc. Esa suposición no está
// garantizada por nada, y el id se usa para pedir la exportación CON DATOS
// PERSONALES: si algún día se rompe, se descargarían datos de personas distintas a
// las filtradas. Cuesta ~150 KB y elimina el riesgo.
const OMITIR = new Set([]);

/** ¿Ya hay un dataset real en disco? */
function hayDatasetReal() {
  if (!existsSync(SALIDA)) return false;
  try {
    const d = JSON.parse(readFileSync(SALIDA, 'utf8'));
    return d && d.es_ejemplo === false && d.total > 0;
  } catch {
    return false;
  }
}

function usarEjemplo(motivo) {
  // NUNCA pisar un dataset real con el de ejemplo. Si la descarga falla —un 504 de
  // Supabase alcanza— y aqui se escribiera el ejemplo igual, un `npm run build`
  // local cambiaria 24.203 filas por 300 sin que nadie lo note hasta abrir el panel.
  // Ante la duda se conserva lo que ya hay: un dataset viejo es recuperable, uno
  // borrado no.
  if (hayDatasetReal()) {
    console.warn(`[dataset] ${motivo}`);
    console.warn('[dataset] Se CONSERVA el dataset real que ya estaba en disco. No se pisa nada.');
    console.warn('[dataset] Para regenerarlo cuando Supabase responda: npm run dataset');
    return;
  }
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

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Trae una pagina reintentando los fallos transitorios. La vista cruza varias
 * tablas y PostgREST devuelve 504 de vez en cuando: sin reintento, un timeout
 * aislado tumba el deploy entero de Vercel, donde el error se lanza a proposito.
 */
async function leerPagina(offset, intentos = 4) {
  // El `order` explicito NO es decorativo: sin el, PostgREST no garantiza orden
  // estable entre paginas y se repiten o se pierden filas (incidente 2026-09-08).
  const url = `${URL_BASE}/rest/v1/${VISTA}?select=*&order=id_publico.asc&limit=${PAGINA}&offset=${offset}`;
  for (let intento = 1; ; intento++) {
    try {
      const resp = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
      if (resp.ok) return resp.json();
      const transitorio = resp.status >= 500 || resp.status === 429;
      if (!transitorio || intento >= intentos) {
        throw new Error(`${VISTA}: HTTP ${resp.status} ${await resp.text()}`);
      }
      console.warn(`[dataset] HTTP ${resp.status} en offset ${offset}, reintento ${intento}/${intentos - 1}`);
    } catch (e) {
      if (intento >= intentos) throw e;
      console.warn(`[dataset] ${e.message} — reintento ${intento}/${intentos - 1}`);
    }
    await dormir(2000 * intento); // espera creciente: 2s, 4s, 6s
  }
}

async function leerTodo() {
  const filas = [];
  for (let offset = 0; ; offset += PAGINA) {
    const lote = await leerPagina(offset);
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
      const col = filas.map((f) => {
        if (f[campo] === null || f[campo] === undefined) return null;
        if (campo === 'edad' && f.edad_valida !== true) return null;
        return Number(f[campo]);
      });
      const reales = col.filter((v) => v !== null);
      campos[campo] = {
        tipo: 'num',
        etiqueta: campo,
        min: reales.length ? Math.min(...reales) : 0,
        max: reales.length ? Math.max(...reales) : 0,
      };
      columnas[campo] = col;
    } else if (BOOLEANOS.has(campo) && esBooleanoDeVerdad(filas, campo)) {
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

  const categorias = [
    ['Con datos', 'Sin dato', 'No aplica'],
    ['No', 'Sí'],
  ];
  const curso = filas.map((f) => f.seleccionado === true
    ? (f.pct_avance == null ? 1 : 0)
    : 2);
  campos.datos_curso = { tipo: 'cat', etiqueta: 'Datos de curso', valores: categorias[0] };
  columnas.datos_curso = curso;
  const duplicados = filas.map((f) => f.duplicado_de == null ? 0 : 1);
  campos.envio_duplicado = { tipo: 'cat', etiqueta: 'Envío duplicado', valores: categorias[1] };
  columnas.envio_duplicado = duplicados;

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
