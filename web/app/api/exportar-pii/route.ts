import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CORREOS_PERMITIDOS } from '@/lib/auth.config';

export const dynamic = 'force-dynamic';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.CONV_SUPABASE_SERVICE_ROLE_KEY ?? '';
const MAX_FILAS = 5000;
const CAMPOS = [
  'id_publico',
  'cedula_cruda',
  'nombres',
  'apellidos',
  'email',
  'celular',
  'ciudad',
  'convocatoria',
  'seleccionado',
] as const;
const ETIQUETAS = ['ID público', 'Cédula', 'Nombres', 'Apellidos', 'Email', 'Celular', 'Ciudad', 'Convocatoria', 'Seleccionada'];

type Body = { ids?: unknown; filtros?: unknown };

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
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? Array.from(new Set(body.ids.filter((id): id is number => Number.isInteger(id) && id > 0)))
    : [];
  if (ids.length !== (Array.isArray(body.ids) ? body.ids.length : 0)) {
    return NextResponse.json(
      { error: 'ids debe contener enteros positivos sin repetir' },
      { status: 400 },
    );
  }
  if (ids.length === 0)
    return NextResponse.json({ error: 'Se requiere al menos un id' }, { status: 400 });
  if (ids.length > MAX_FILAS) {
    return NextResponse.json(
      { error: 'Filtra más: el máximo por exportación es de 5.000 filas' },
      { status: 413 },
    );
  }
  if (!SERVICE_KEY)
    return NextResponse.json({ error: 'Exportación no configurada' }, { status: 500 });

  const admin = createClient(URL_BASE, SERVICE_KEY);
  const { data: postulaciones, error: postulacionesError } = await admin
    .from('postulaciones')
    .select('id,id_publico,ciudad_declarada,convocatoria')
    .in('id_publico', ids);
  if (postulacionesError)
    return NextResponse.json({ error: 'No se pudo consultar postulaciones' }, { status: 500 });

  const internalIds = postulaciones.map((row) => row.id);
  const { data: resultados, error: resultadosError } = await admin
    .from('resultado_seleccion')
    .select('postulacion_id,seleccionado')
    .in('postulacion_id', internalIds);
  if (resultadosError)
    return NextResponse.json({ error: 'No se pudo consultar selección' }, { status: 500 });

  const { data: pii, error: piiError } = await admin
    .from('postulaciones_pii')
    .select('postulacion_id,cedula_cruda,nombres,apellidos,email,celular')
    .in('postulacion_id', internalIds);
  if (piiError) return NextResponse.json({ error: 'No se pudo consultar PII' }, { status: 500 });

  if (postulaciones.length !== ids.length || pii.length !== ids.length) {
    return NextResponse.json(
      { error: 'Una o más postulaciones no tienen PII completa' },
      { status: 409 },
    );
  }

  const porResultado = new Map(
    resultados.map((row) => [row.postulacion_id, Boolean(row.seleccionado)]),
  );
  const porPii = new Map(pii.map((row) => [row.postulacion_id, row]));
  const porId = new Map(postulaciones.map((row) => [row.id_publico, row]));
  const filas = ids.map((id) => {
    const postulacion = porId.get(id)!;
    const datos = porPii.get(postulacion.id)!;
    return [
      id,
      datos.cedula_cruda,
      datos.nombres,
      datos.apellidos,
      datos.email,
      datos.celular,
      postulacion.ciudad_declarada,
      postulacion.convocatoria,
      porResultado.get(postulacion.id) ?? false,
    ];
  });

  const { error: logError } = await admin.from('export_log').insert({
    correo,
    filas: filas.length,
    filtros: body.filtros && typeof body.filtros === 'object' ? body.filtros : null,
  });
  if (logError)
    return NextResponse.json({ error: 'No se pudo registrar la exportación' }, { status: 500 });

  const csv = `\uFEFF${[ETIQUETAS.join(','), ...filas.map((fila) => fila.map(escaparCsv).join(','))].join('\n')}`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="postulaciones_con_datos_personales.csv"',
      'Cache-Control': 'no-store',
    },
  });
}

function escaparCsv(value: unknown) {
  const texto = value === null || value === undefined ? '' : String(value);
  return `"${texto.replaceAll('"', '""')}"`;
}
