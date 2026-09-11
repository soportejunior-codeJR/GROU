/** @type {import('next').NextConfig} */
// OJO: a diferencia de panel-datos-rofe, aqui NO se usa output:'export'.
// El dataset se sirve por un route handler (app/api/datos/route.ts) que valida
// la sesion del lado del servidor; un export estatico no permite route handlers
// y dejaria los microdatos descargables por cualquiera que adivine la URL.
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
