'use client';

import { useMemo } from 'react';
import { contarFacetas, type Dataset, type Filtro, type Filtros, type Modo } from '@/lib/dataset';

const LABELS: Record<string, string> = {
  convocatoria: 'Convocatoria',
  pais: 'País',
  ciudad: 'Ciudad',
  fecha_envio: 'Fecha de envío',
  edad: 'Edad',
  genero: 'Género',
  situacion_educativa: 'Situación educativa',
  promedio_pct: 'Promedio (%)',
  segmentos: 'Segmentos',
  ocupaciones: 'Ocupaciones',
  condicion_laboral: 'Condición laboral',
  emprendimiento: 'Emprendimiento',
  otros_programas: 'Otros programas',
  estrato: 'Estrato',
  ingreso_hogar: 'Ingreso del hogar',
  personas_nucleo: 'Personas en el núcleo',
  tipo_vivienda: 'Tipo de vivienda',
  indice_activos: 'Índice de activos',
  tiene_internet: 'Internet',
  acceso_computador: 'Acceso a computador',
  horas_semanales: 'Horas semanales',
  comodidad_autonomo: 'Comodidad aprendiendo',
  nivel_ingles: 'Nivel de inglés',
  nivel_software: 'Nivel de software',
  como_se_entero: 'Cómo se enteró',
  tiene_embajador: 'Embajador',
};

export default function FiltroCard({
  ds,
  campo,
  filtros,
  cambiar,
  modo,
}: {
  ds: Dataset;
  campo: string;
  filtros: Filtros;
  cambiar: (c: string, f: Filtro | null) => void;
  modo: Modo;
}) {
  const def = ds.campos[campo];
  const actual = filtros[campo];
  const counts = useMemo(() => contarFacetas(ds, campo, filtros, modo), [ds, campo, filtros, modo]);
  const label = LABELS[campo] ?? def.etiqueta;
  if (def.tipo === 'num') {
    const f =
      actual?.tipo === 'num'
        ? actual
        : { tipo: 'num' as const, min: def.min ?? 0, max: def.max ?? 100, incluirSinDato: false };
    return (
      <fieldset>
        <legend>{label}</legend>
        <div className="range">
          <input
            type="number"
            value={f.min}
            min={def.min}
            max={def.max}
            onChange={(e) => cambiar(campo, { ...f, min: Number(e.target.value) })}
          />
          <span>–</span>
          <input
            type="number"
            value={f.max}
            min={def.min}
            max={def.max}
            onChange={(e) => cambiar(campo, { ...f, max: Number(e.target.value) })}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={f.incluirSinDato}
            onChange={(e) => cambiar(campo, { ...f, incluirSinDato: e.target.checked })}
          />{' '}
          Sin dato
        </label>
        {actual && (
          <button onClick={() => cambiar(campo, null)} className="clear">
            × quitar
          </button>
        )}
      </fieldset>
    );
  }
  if (def.tipo === 'bool') {
    const f = actual?.tipo === 'bool' ? actual : null;
    return (
      <fieldset>
        <legend>{label}</legend>
        {[1, 0].map((v) => (
          <label className="check" key={v}>
            <input
              type="checkbox"
              checked={f?.valor === v}
              onChange={(e) =>
                cambiar(campo, e.target.checked ? { tipo: 'bool', valor: v as 0 | 1 } : null)
              }
            />{' '}
            {v ? 'Sí' : 'No'} <small>{counts[v] ?? 0}</small>
          </label>
        ))}
      </fieldset>
    );
  }
  const values = def.valores ?? [];
  const selected =
    actual && (actual.tipo === 'cat' || actual.tipo === 'multi') ? actual.valores : [];
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="options">
        {values.map((value, i) => (
          <label className="check" key={value}>
            <input
              type="checkbox"
              checked={selected.includes(i)}
              onChange={(e) => {
                const next = e.target.checked ? [...selected, i] : selected.filter((x) => x !== i);
                cambiar(campo, next.length ? ({ tipo: def.tipo, valores: next } as Filtro) : null);
              }}
            />{' '}
            <span>{value}</span> <small>{counts[i] ?? 0}</small>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
