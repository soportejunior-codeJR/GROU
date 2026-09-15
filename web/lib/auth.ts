// Login con Google para cuentas @tocaunavida.org (mas los correos explicitos de
// lib/auth.config.ts).
//
// 2026-09-15: hasta ese dia era una lista blanca de un solo correo, a proposito, porque
// la base tiene datos personales de ~21.400 personas, muchas menores. Samuel decidio
// abrirlo a todo el dominio con acceso completo. La proteccion real esta en el servidor
// (usuarioAutorizado exige cuenta de Google verificada); lo de este archivo es cortesia.
'use client';

import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { correoConAcceso, DOMINIO_PERMITIDO } from './auth.config';

export { CORREOS_PERMITIDOS, DOMINIO_PERMITIDO } from './auth.config';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

let cliente: SupabaseClient | null = null;

/**
 * Cliente perezoso: se crea en el primer uso, ya en el navegador.
 *
 * No crearlo al cargar el modulo. `createClient` lanza "supabaseUrl is required" si
 * las variables estan vacias, y durante el prerender del build lo estan — eso tumba
 * `next build` entero aunque el panel funcione bien en el navegador.
 */
export function clienteAuth(): SupabaseClient {
  if (!cliente)
    cliente = createClient(URL_BASE, ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  return cliente;
}

/** true si las variables publicas estan configuradas. Sin esto no hay login posible. */
export function authConfigurada(): boolean {
  return Boolean(URL_BASE && ANON_KEY);
}

export function correoPermitido(email: string | undefined | null): boolean {
  return correoConAcceso(email);
}

export async function iniciarSesionGoogle() {
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  await clienteAuth().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // hd: Google muestra primero las cuentas del Workspace (solo interfaz, no seguridad).
      // select_account: deja elegir otra cuenta si el navegador tiene una personal abierta.
      queryParams: { hd: DOMINIO_PERMITIDO, prompt: 'select_account' },
    },
  });
}

export async function cerrarSesion() {
  await clienteAuth().auth.signOut();
}

export async function sesionActual(): Promise<Session | null> {
  const { data } = await clienteAuth().auth.getSession();
  return data.session ?? null;
}
