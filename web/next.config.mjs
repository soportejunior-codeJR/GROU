/** @type {import('next').NextConfig} */
// OJO: a diferencia de panel-datos-rofe, aqui NO se usa output:'export'.
// El dataset se sirve por un route handler (app/api/datos/route.ts) que valida
// la sesion del lado del servidor; un export estatico no permite route handlers
// y dejaria los microdatos descargables por cualquiera que adivine la URL.
const nextConfig = {
  reactStrictMode: true,

  // `next dev` y `next build` escriben los mismos chunks en la misma carpeta y se
  // pisan: si alguien compila mientras hay un servidor de desarrollo vivo, el dev
  // empieza a lanzar "Cannot find module './NNN.js'" y hay que borrar .next.
  // Con esto el servidor de desarrollo puede usar su propio directorio:
  //     NEXT_DIST_DIR=.next-dev npm run dev
  // Los builds (y Vercel) siguen usando .next sin cambio alguno.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
