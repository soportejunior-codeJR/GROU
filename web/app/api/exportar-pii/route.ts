import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CORREOS_PERMITIDOS } from '@/lib/auth.config';
import { armarCsvFilaCompleta, type Respuesta } from '@/lib/exportarFila';

export const dynamic = 'force-dynamic';
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.CONV_SUPABASE_SERVICE_ROLE_KEY ?? '';
const MAX_FILAS = 3000;
const TAMANO_MAXIMO = 4_000_000;
const BATCH = 500;

type Body = { ids?: unknown; filtros?: unknown };
type Postulacion = { id: string; id_publico: number; convocatoria: string; pais: string };
type Pii = { postulacion_id: string; cedula_norm: string | null };
type Resultado = { postulacion_id: string; seleccionado: boolean };
type Respuestas = { postulacion_id: string; respuestas: Respuesta[] };

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });
  const supabaseAuth = createClient(URL_BASE, ANON_KEY);
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
  const correo = userData?.user?.email?.trim().toLowerCase();
  if (userError || !correo || !CORREOS_PERMITIDOS.includes(correo)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 401 });
  }
  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ error: 'JSON invalido' }, { status: 400 }); }
  const ids = Array.isArray(body.ids)
    ? Array.from(new Set(body.ids.filter((id): id is number => Number.isInteger(id) && id > 0))) : [];
  if (ids.length !== (Array.isArray(body.ids) ? body.ids.length : 0)) {
    return NextResponse.json({ error: 'ids debe contener enteros positivos sin repetir' }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ error: 'Se requiere al menos un id' }, { status: 400 });
  if (ids.length > MAX_FILAS) {
    return NextResponse.json({ error: 'Filtra más: el máximo por exportación es de 3.000 filas' }, { status: 413 });
  }
  if (!SERVICE_KEY) return NextResponse.json({ error: 'Exportación no configurada' }, { status: 500 });
  const admin = createClient(URL_BASE, SERVICE_KEY);
  const postulaciones = await consultarEnTandas<Postulacion>(admin, 'postulaciones', 'id_publico', ids,
    'id,id_publico,convocatoria,pais');
  if (postulaciones.length !== ids.length) {
    return NextResponse.json({ error: 'Una o más postulaciones no tienen PII completa' }, { status: 409 });
  }
  const internalIds = postulaciones.map((row) => row.id);
  const [resultados, pii, respuestas] = await Promise.all([
    consultarEnTandas<Resultado>(admin, 'resultado_seleccion', 'postulacion_id', internalIds,
      'postulacion_id,seleccionado'),
    consultarEnTandas<Pii>(admin, 'postulaciones_pii', 'postulacion_id', internalIds,
      'postulacion_id,cedula_norm'),
    consultarEnTandas<Respuestas>(admin, 'postulaciones_respuestas', 'postulacion_id', internalIds,
      'postulacion_id,respuestas'),
  ]);
  if (pii.length !== ids.length) {
    return NextResponse.json({ error: 'Una o más postulaciones no tienen PII completa' }, { status: 409 });
  }
  if (respuestas.length !== ids.length) {
    return NextResponse.json({ error: 'Una o más postulaciones no tienen la fila completa cargada' }, { status: 409 });
  }
  const porResultado = new Map(resultados.map((row) => [row.postulacion_id, Boolean(row.seleccionado)]));
  const porPii = new Map(pii.map((row) => [row.postulacion_id, row]));
  const porRespuesta = new Map(respuestas.map((row) => [row.postulacion_id, row.respuestas]));
  const porId = new Map(postulaciones.map((row) => [row.id_publico, row]));
  const filas = ids.map((id) => {
    const postulacion = porId.get(id)!;
    return {
      id_publico: id, convocatoria: postulacion.convocatoria, pais: postulacion.pais,
      seleccionado: porResultado.get(postulacion.id) ?? false,
      cedula_norm: porPii.get(postulacion.id)!.cedula_norm,
      respuestas: porRespuesta.get(postulacion.id)!,
    };
  });
  const csv = armarCsvFilaCompleta(filas);
  if (new TextEncoder().encode(csv).byteLength > TAMANO_MAXIMO) {
    return NextResponse.json({ error: 'Filtra más: el archivo supera el tamaño permitido' }, { status: 413 });
  }
  const { error: logError } = await admin.from('export_log').insert({
    correo, filas: filas.length,
    filtros: body.filtros && typeof body.filtros === 'object' ? body.filtros : null,
    alcance: 'fila_completa',
  });
  if (logError) return NextResponse.json({ error: 'No se pudo registrar la exportación' }, { status: 500 });
  return new NextResponse(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="postulaciones_fila_completa.csv"',
    'Cache-Control': 'no-store',
  }});
}

async function consultarEnTandas<T>(admin: SupabaseClient<any, any, any>, table: string, columna: string,
  ids: string[] | number[], select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += BATCH) {
    const { data, error } = await admin.from(table).select(select).in(columna, ids.slice(start, start + BATCH));
    if (error) throw new Error(`consulta ${table} falló`);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}
