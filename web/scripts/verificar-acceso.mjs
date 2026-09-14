const BASE = (process.env.PANEL_URL || 'https://grou-tvsk.vercel.app').replace(/\/$/, '');

const limpio = {
  redirect: 'manual',
  cache: 'no-store',
  credentials: 'omit',
  headers: { Accept: 'text/html,application/json' },
};

async function pedir(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, { ...limpio, ...options });
  return { response, body: await response.text() };
}

function resultado(numero, ok, detalle) {
  console.log(`${ok ? 'OK' : 'FALLA'} ${numero}  ${detalle}`);
  return ok;
}

function cuerpoVercel(body) {
  return /protection|auto_vercel_auth_redirect|vercel_auth_enabled/i.test(body);
}

function mensajeAcceso(body) {
  if (cuerpoVercel(body)) {
    return [
      'El 401 lo pone Vercel, no la app.',
      'Settings → Deployment Protection → Vercel Authentication',
      'debe estar en "Only Preview Deployments" o desactivado.',
    ].join('\n       ');
  }
  if (/Sesion requerida|Sin acceso/.test(body)) return 'El 401 lo pone la app.';
  return 'No se pudo identificar al emisor del 401.';
}

function validar401(response, body) {
  if (response.status !== 401) return { ok: false, detalle: `HTTP ${response.status}` };
  if (cuerpoVercel(body)) return { ok: false, detalle: mensajeAcceso(body) };
  if (/Sesion requerida|Sin acceso/.test(body)) {
    return { ok: true, detalle: '401 de la app' };
  }
  return { ok: false, detalle: '401 sin cuerpo reconocido' };
}

async function main() {
  const root = await pedir('/');
  const api = await pedir('/api/datos', { headers: { Accept: 'application/json' } });
  const pii = await pedir('/api/exportar-pii', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [1] }),
  });
  const dataset = await pedir('/data/postulaciones.json');

  let passed = 0;
  passed += resultado(1, root.response.status === 200 && /Panel de Convocatoria/.test(root.body), `GET / → HTTP ${root.response.status}`) ? 1 : 0;

  const respuesta401 = root.response.status === 401 ? root.body : api.response.status === 401 ? api.body : '';
  const emisorOk = /Sesion requerida|Sin acceso/.test(respuesta401) && !cuerpoVercel(respuesta401);
  const emisorDetalle = respuesta401 ? mensajeAcceso(respuesta401) : `no hubo 401 identificable (raíz ${root.response.status}, API ${api.response.status})`;
  if (emisorOk) passed++;
  console.log(`${emisorOk ? 'OK' : 'FALLA'} 2  ${emisorDetalle}`);

  const api401 = validar401(api.response, api.body);
  const pii401 = validar401(pii.response, pii.body);
  passed += resultado(3, api401.ok, `GET /api/datos sin sesión → ${api401.detalle}`) ? 1 : 0;
  passed += resultado(4, pii401.ok, `POST /api/exportar-pii sin sesión → ${pii401.detalle}`) ? 1 : 0;
  passed += resultado(5, dataset.response.status === 404, `GET /data/postulaciones.json → HTTP ${dataset.response.status}`) ? 1 : 0;

  let cssOk = false;
  const stylesheet = root.body.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)/i)?.[1];
  if (stylesheet) {
    const css = await pedir(stylesheet.startsWith('http') ? stylesheet : stylesheet.startsWith('/') ? stylesheet : `/${stylesheet}`, { headers: { Accept: 'text/css' } });
    cssOk = css.response.status === 200 && /text\/css/i.test(css.response.headers.get('content-type') || '');
  } else {
    cssOk = root.response.status === 200 && /text\/html/i.test(root.response.headers.get('content-type') || '');
  }
  passed += resultado(6, cssOk, stylesheet ? `CSS ${stylesheet} → ${cssOk ? 'carga' : 'no carga'}` : `raíz → ${cssOk ? 'HTML carga' : 'sin HTML'}`) ? 1 : 0;

  console.log(`T11 ${passed === 6 ? 'OK' : 'FALLA'}: ${passed}/6 comprobaciones`);
  process.exitCode = passed === 6 ? 0 : 1;
}

main().catch((error) => {
  console.error(`T11 FALLA: no se pudo completar el verificador (${error.message})`);
  process.exitCode = 1;
});
