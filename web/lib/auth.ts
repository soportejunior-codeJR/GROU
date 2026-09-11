// Login con Google restringido a una LISTA BLANCA de correos.
//
// Deliberadamente distinto de panel-datos-rofe, que valida por dominio
// (DOMINIO_PERMITIDO === 'tocaunavida.org'). Con validacion por dominio entra
// cualquier cuenta del Workspace, y esta base tiene datos personales de ~21.400
// personas, muchas menores de edad. Aqui entra quien este en la lista y nadie mas.
//
// Agregar personas = agregar correos en lib/auth.config.ts. No reintroducir el
// chequeo por dominio "como respaldo": seria exactamente el agujero que la lista evita.
'use client';

import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { CORREOS_PERMITIDOS } from './auth.config';

export { CORREOS_PERMITIDOS } from './auth.config';

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
  if (!cliente) cliente = createClient(URL_BASE, ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return cliente;
}

/** true si las variables publicas estan configuradas. Sin esto no hay login posible. */
export function authConfigurada(): boolean {
  return Boolean(URL_BASE && ANON_KEY);
}

export function correoPermitido(email: string | undefined | null): boolean {
  if (!email) return false;
  return CORREOS_PERMITIDOS.includes(email.trim().toLowerCase());
}

export async function iniciarSesionGoogle() {
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  await clienteAuth().auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
}

export async function cerrarSesion() {
  await clienteAuth().auth.signOut();
}

export async function sesionActual(): Promise<Session | null> {
  const { data } = await clienteAuth().auth.getSession();
  return data.session ?? null;
}
