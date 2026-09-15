// Reglas de acceso compartidas entre el cliente y el servidor.
// Vive aparte de lib/auth.ts porque ese archivo es 'use client' y los route handlers
// no pueden importarlo. Un solo lugar para las reglas; se validan en tres sitios:
// el cliente (cortesia para la interfaz) y /api/datos + /api/exportar-pii (proteccion real).
//
// 2026-09-15, decision de Samuel: entra CUALQUIER cuenta @tocaunavida.org con acceso
// completo, incluido el export con datos personales. Hasta ese dia era una lista blanca
// de un solo correo. Cada export con datos personales queda en export_log con el correo
// de quien lo hizo.

export const DOMINIO_PERMITIDO = 'tocaunavida.org';

/** Correos con acceso explicito, ademas del dominio (p. ej. alguien externo autorizado). */
export const CORREOS_PERMITIDOS: string[] = ['soportejunior@tocaunavida.org'];

function esDelDominio(correo: string): boolean {
  const arroba = correo.lastIndexOf('@');
  // Comparacion exacta del dominio: ni subdominios ni "x@otro-tocaunavida.org".
  return arroba > 0 && correo.slice(arroba + 1) === DOMINIO_PERMITIDO;
}

/** Regla por correo. En el cliente es solo cortesia; el servidor usa usuarioAutorizado. */
export function correoConAcceso(email: string | null | undefined): boolean {
  if (!email) return false;
  const correo = email.trim().toLowerCase();
  return CORREOS_PERMITIDOS.includes(correo) || esDelDominio(correo);
}

type UsuarioSupabase = {
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string; providers?: string[] } | null;
  user_metadata?: { custom_claims?: { hd?: string } } | null;
};

/**
 * Validacion del SERVIDOR sobre el usuario que devuelve supabase.auth.getUser(token).
 *
 * El correo solo no basta: si el registro con correo y contrasena de Supabase estuviera
 * abierto, cualquiera podria crearse "loquesea@tocaunavida.org" sin tener ese buzon y
 * pasaria un chequeo por dominio. Por eso se exige que la cuenta haya entrado con Google
 * (Google ya verifico el correo) y que el correo este confirmado. Si Google envia el
 * dominio de Workspace (claim hd), tiene que coincidir.
 */
export function usuarioAutorizado(user: UsuarioSupabase | null | undefined): boolean {
  if (!user?.email || !correoConAcceso(user.email)) return false;
  const app = user.app_metadata ?? {};
  const proveedores = app.providers ?? (app.provider ? [app.provider] : []);
  if (!proveedores.includes('google')) return false;
  if (!user.email_confirmed_at) return false;
  const correo = user.email.trim().toLowerCase();
  const hd = user.user_metadata?.custom_claims?.hd;
  if (esDelDominio(correo) && hd && hd.toLowerCase() !== DOMINIO_PERMITIDO) return false;
  return true;
}
