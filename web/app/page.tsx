'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  clienteAuth,
  authConfigurada,
  correoPermitido,
  iniciarSesionGoogle,
  cerrarSesion,
} from '@/lib/auth';
import { filtrar, type Dataset, type Filtro, type Filtros, type Modo } from '@/lib/dataset';
import FiltroCard from '@/components/FiltroCard';
import Encabezado from '@/components/Encabezado';
import TablaResultados from '@/components/TablaResultados';
import { encodeFilter, parseUrl } from '@/lib/urlFiltros';

const GROUPS = [
  ['Identidad y origen', ['convocatoria', 'pais', 'ciudad', 'fecha_envio']],
  ['Perfil', ['edad', 'genero', 'situacion_educativa', 'promedio_pct', 'segmentos']],
  ['Situación', ['ocupaciones', 'condicion_laboral', 'emprendimiento', 'otros_programas']],
  [
    'Socioeconómico',
    ['estrato', 'ingreso_hogar', 'personas_nucleo', 'tipo_vivienda', 'indice_activos'],
  ],
  [
    'Capacidad',
    [
      'tiene_internet',
      'acceso_computador',
      'horas_semanales',
      'comodidad_autonomo',
      'nivel_ingles',
      'nivel_software',
    ],
  ],
  ['Origen del contacto', ['como_se_entero', 'tiene_embajador']],
] as const;

export default function Pagina() {
  const [correo, setCorreo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!authConfigurada()) {
      setError('Faltan las variables públicas de Supabase.');
      setCargando(false);
      return;
    }
    let vivo = true;
    const auth = clienteAuth();
    auth.auth.getSession().then(async ({ data }) => {
      const sesion = data.session;
      if (!vivo) return;
      const email = sesion?.user?.email ?? null;
      setCorreo(email);
      setCargando(false);
      if (!sesion || !correoPermitido(email)) return;
      try {
        const r = await fetch('/api/datos', {
          headers: { Authorization: `Bearer ${sesion.access_token}` },
        });
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
        if (vivo) setDatos(await r.json());
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el dataset');
      }
    });
    const { data: sub } = auth.auth.onAuthStateChange((evento) => {
      /* OJO: supabase-js dispara INITIAL_SESSION apenas uno se suscribe. Recargar en CUALQUIER evento mete a la pagina en un bucle infinito de recargas y los chunks nunca terminan de bajar. Solo recargar cuando el usuario realmente entra o sale. */ if (
        evento === 'SIGNED_IN' ||
        evento === 'SIGNED_OUT'
      )
        location.reload();
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  if (cargando)
    return (
      <Marco>
        <p>Cargando…</p>
      </Marco>
    );
  if (!authConfigurada())
    return (
      <Marco>
        <p style={{ color: '#8e3431' }}>{error}</p>
      </Marco>
    );
  if (!correo)
    return (
      <Marco>
        <p className="muted">
          Este panel contiene datos personales y está limitado a cuentas autorizadas.
        </p>
        <button onClick={iniciarSesionGoogle} style={button}>
          Entrar con Google
        </button>
      </Marco>
    );
  if (!correoPermitido(correo))
    return (
      <Marco>
        <p className="muted">
          La cuenta <b>{correo}</b> no está autorizada.
        </p>
        <button onClick={cerrarSesion} style={button}>
          Salir
        </button>
      </Marco>
    );
  return (
    <Marco>
      {error && <p style={{ color: '#8e3431' }}>{error}</p>}
      {datos && <Explorador ds={datos} />}
      <button onClick={cerrarSesion} style={{ ...button, marginTop: 28 }}>
        Salir
      </button>
    </Marco>
  );
}

function Explorador({ ds }: { ds: Dataset }) {
  const [filtros, setFiltros] = useState<Filtros>(() => parseUrl(ds));
  const [modo, setModo] = useState<Modo>(() =>
    new URLSearchParams(location.search).get('modo') === 'AL_MENOS_UNA' ? 'AL_MENOS_UNA' : 'TODAS',
  );
  const [todos, setTodos] = useState(true);
  const indices = useMemo(() => filtrar(ds, filtros, modo), [ds, filtros, modo]);
  const selected = useMemo(
    () => Array.from(indices).filter((i) => valueAt(ds, 'seleccionado', i) === true).length,
    [ds, indices],
  );
  useEffect(() => {
    const q = new URLSearchParams({ modo });
    Object.entries(filtros).forEach(([c, f]) => q.set(c, encodeFilter(f)));
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }, [filtros, modo]);
  const cambiar = (c: string, f: Filtro | null) =>
    setFiltros((prev) => {
      const n = { ...prev };
      if (f) n[c] = f;
      else delete n[c];
      return n;
    });
  const exportar = () => {
    const cols = [
      'id_publico',
      'convocatoria',
      'pais',
      'ciudad',
      'fecha_envio',
      'seleccionado',
      'duplicado_de',
    ];
    const lines = [cols.join(',')];
    Array.from(indices).forEach((i) =>
      lines.push(cols.map((c) => csv(valueAt(ds, c, i))).join(',')),
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'postulaciones_filtradas_sin_pii.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const used: Set<string> = new Set(GROUPS.flatMap(([, fields]) => fields));
  const extra = Object.keys(ds.campos).filter((c) => !used.has(c) && c !== 'id_publico');
  return (
    <>
      <Encabezado
        ds={ds}
        totalVigente={indices.length}
        seleccionadas={selected}
        exportar={exportar}
      />
      {ds.es_ejemplo && <p style={{ color: '#8e3431' }}>Advertencia: dataset de ejemplo.</p>}
      <div className="toolbar">
        <button
          onClick={() => {
            setFiltros({});
            setModo('TODAS');
          }}
          style={secondary}
        >
          Limpiar filtros
        </button>
        <label>
          Modo{' '}
          <select value={modo} onChange={(e) => setModo(e.target.value as Modo)}>
            <option>TODAS</option>
            <option>AL_MENOS_UNA</option>
          </select>
        </label>
        <span className="muted">{Object.keys(filtros).length} filtros activos</span>
      </div>
      {GROUPS.map(([name, fields]) => (
        <section key={name}>
          <h2>{name}</h2>
          <div className="filtergrid">
            {fields
              .filter((c) => ds.campos[c])
              .map((c) => (
                <FiltroCard
                  key={c}
                  ds={ds}
                  campo={c}
                  filtros={filtros}
                  cambiar={cambiar}
                  modo={modo}
                />
              ))}
          </div>
        </section>
      ))}
      {extra.length > 0 && (
        <section>
          <h2>Otros campos</h2>
          <div className="filtergrid">
            {(todos ? extra : extra.slice(0, 8)).map((c) => (
              <FiltroCard
                key={c}
                ds={ds}
                campo={c}
                filtros={filtros}
                cambiar={cambiar}
                modo={modo}
              />
            ))}
          </div>
          {extra.length > 8 && (
            <button onClick={() => setTodos(!todos)} style={secondary}>
              {todos ? 'Mostrar menos' : `Mostrar los ${extra.length - 8} restantes`}
            </button>
          )}
        </section>
      )}
      <TablaResultados ds={ds} indices={indices} />
    </>
  );
}

function valueAt(ds: Dataset, c: string, i: number): string | number | boolean | null {
  if (c === 'id_publico') return i + 1;
  const d = ds.campos[c];
  const v = ds.columnas[c]?.[i];
  if (v === null || v === undefined) return null;
  if (d?.tipo === 'cat') return d.valores?.[v as number] ?? null;
  if (d?.tipo === 'multi') return (v as number[]).map((x) => d.valores?.[x]).join(' · ');
  if (d?.tipo === 'bool') return v === 1;
  return v as number;
}
function csv(v: string | number | boolean | null) {
  const s = v === null ? '' : String(v);
  return `"${s.replaceAll('"', '""')}"`;
}
const button: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--surface)',
  border: 'none',
  borderRadius: 4,
  padding: '10px 18px',
  fontSize: 15,
  cursor: 'pointer',
};
const secondary: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 4,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
};
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="shell">
      <p className="eyebrow">Fundación ROFÉ</p>
      <h1>Panel de Convocatoria JC</h1>
      {children}
    </main>
  );
}
