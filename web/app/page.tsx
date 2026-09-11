'use client';

// Cascaron. La interfaz de filtros (T8 del spec) va aqui.
// Lo que ya esta resuelto y NO hay que rehacer:
//   - login con lista blanca            -> lib/auth.ts
//   - entrega protegida del dataset     -> app/api/datos/route.ts
//   - formato del dataset y el filtrado -> lib/dataset.ts (filtrar + contarFacetas)
//
// Ver docs/procesos/panel-convocatoria-jc-spec-codex.md (repo admin-usable), T8.

import { useEffect, useState } from 'react';
import {
  clienteAuth,
  authConfigurada,
  correoPermitido,
  iniciarSesionGoogle,
  cerrarSesion,
} from '@/lib/auth';
import type { Dataset } from '@/lib/dataset';

export default function Pagina() {
  const [correo, setCorreo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authConfigurada()) {
      setError('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      setCargando(false);
      return;
    }
    let vivo = true;
    const supabaseAuth = clienteAuth();
    supabaseAuth.auth.getSession().then(async ({ data }) => {
      const sesion = data.session;
      if (!vivo) return;
      const email = sesion?.user?.email ?? null;
      setCorreo(email);
      setCargando(false);
      if (!sesion || !correoPermitido(email)) return;

      try {
        const resp = await fetch('/api/datos', {
          headers: { Authorization: `Bearer ${sesion.access_token}` },
        });
        if (!resp.ok) throw new Error(`El servidor respondio ${resp.status}`);
        if (vivo) setDatos(await resp.json());
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el dataset');
      }
    });
    const { data: sub } = supabaseAuth.auth.onAuthStateChange(() => location.reload());
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (cargando) return <Marco><p>Cargando...</p></Marco>;

  if (!authConfigurada()) {
    return (
      <Marco>
        <p style={{ color: '#8e3431' }}>{error}</p>
        <p style={{ color: 'var(--ink-2)', marginTop: 12, fontSize: 14 }}>
          Copiar <code>.env.local.example</code> a <code>.env.local</code> y llenarlo, o
          definirlas como Environment Variables del proyecto en Vercel.
        </p>
      </Marco>
    );
  }

  if (!correo) {
    return (
      <Marco>
        <p style={{ color: 'var(--ink-2)', marginBottom: 20 }}>
          Este panel contiene datos personales. El acceso esta limitado a cuentas autorizadas.
        </p>
        <button onClick={iniciarSesionGoogle} style={boton}>Entrar con Google</button>
      </Marco>
    );
  }

  if (!correoPermitido(correo)) {
    return (
      <Marco>
        <p style={{ color: 'var(--ink-2)' }}>
          La cuenta <b>{correo}</b> no esta autorizada para este panel.
        </p>
        <button onClick={cerrarSesion} style={{ ...boton, marginTop: 20 }}>Salir</button>
      </Marco>
    );
  }

  return (
    <Marco>
      {error && <p style={{ color: '#8e3431' }}>{error}</p>}
      {datos && (
        <>
          <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {datos.total.toLocaleString('es-CO')} postulaciones
          </p>
          <p style={{ color: 'var(--ink-2)', marginTop: 4 }}>
            {Object.keys(datos.campos).length} campos filtrables
            {datos.es_ejemplo && ' — datos de ejemplo, la base real aun no esta conectada'}
          </p>
          <p style={{ color: 'var(--ink-2)', marginTop: 24, fontSize: 14 }}>
            Interfaz de filtros pendiente (T8). El dataset ya carga y{' '}
            <code>lib/dataset.ts</code> trae <code>filtrar()</code> y{' '}
            <code>contarFacetas()</code> listos para usar.
          </p>
        </>
      )}
      <button onClick={cerrarSesion} style={{ ...boton, marginTop: 32 }}>Salir</button>
    </Marco>
  );
}

const boton: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--surface)',
  border: 'none',
  borderRadius: 3,
  padding: '10px 18px',
  fontSize: 15,
  cursor: 'pointer',
};

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '64px 20px' }}>
      <p style={{ fontFamily: 'var(--fuente-mono)', fontSize: 12, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--ink-2)' }}>
        Fundacion ROFE
      </p>
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.025em', margin: '10px 0 22px' }}>
        Panel de Convocatoria JC
      </h1>
      {children}
    </main>
  );
}
