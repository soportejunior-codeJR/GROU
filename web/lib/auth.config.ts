// Lista blanca compartida entre el cliente y el servidor.
// Vive aparte de lib/auth.ts porque ese archivo es 'use client' y el route handler
// no puede importarlo. Un solo lugar para la lista, dos lugares donde se valida.
export const CORREOS_PERMITIDOS = ['soportejunior@tocaunavida.org'];
