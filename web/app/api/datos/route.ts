// Sirve el dataset solo a quien tenga sesion valida Y este en la lista blanca.
//
// La validacion del cliente (lib/auth.ts) es cortesia para la interfaz; ESTA es la
// que protege. Sin token o con un correo fuera de la lista: 401, sin cuerpo.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CORREOS_PERMITIDOS } from '@/lib/auth.config';
import datos from '@/data/postulaciones.json';

export const dynamic = 'force-dynamic';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });
  }

  const supabase = createClient(URL_BASE, ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  const correo = data?.user?.email?.trim().toLowerCase();

  if (error || !correo || !CORREOS_PERMITIDOS.includes(correo)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 401 });
  }

  // Vercel comprime la respuesta; no hace falta gzipear a mano.
  return NextResponse.json(datos, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  });
}
