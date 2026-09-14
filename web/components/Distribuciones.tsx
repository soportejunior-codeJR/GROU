'use client';

import { useMemo, useState } from 'react';
import { filtrar, type Dataset, type Filtros, type Modo } from '@/lib/dataset';
import { camposOcultos } from '@/lib/camposPanel';
import { rangosNumericos } from '@/lib/rangosNumericos';
import { LABELS } from './FiltroCard';

const GROUPS = [
  ['Identidad y origen', ['convocatoria', 'pais', 'ciudad', 'fecha_envio']],
  ['Perfil', ['edad', 'genero', 'situacion_educativa', 'promedio_pct', 'segmentos', 'anio_grado']],
  ['Situación', ['ocupaciones', 'condicion_laboral', 'emprendimiento', 'otros_programas']],
  [
    'Socioeconómico',
    ['estrato_cat', 'ingreso_hogar', 'personas_nucleo', 'tipo_vivienda', 'indice_activos'],
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
  [
    'Resultado',
    ['seleccionado', 'retirado', 'estado_final', 'fase_max_alcanzada', 'enrutado_fuera_cobertura'],
  ],
  ['Antecedentes con JC', ['aplico_antes_jc', 'fue_beneficiario_antes']],
];

export default function Distribuciones({
  ds,
  filtros,
  modo,
  onClose,
}: {
  ds: Dataset;
  filtros: Filtros;
  modo: Modo;
  onClose: () => void;
}) {
  const [ordenar, setOrdenar] = useState(false);
  const base = useMemo(() => filtrar(ds, filtros, modo, 'seleccionado'), [ds, filtros, modo]);
  const selected = Array.from(base).filter((i) => ds.columnas.seleccionado?.[i] === 1);
  const rest = Array.from(base).filter((i) => ds.columnas.seleccionado?.[i] !== 1);
  const ocultos = camposOcultos(ds);
  const fields = GROUPS.flatMap(([, campos]) => campos).filter(
    (campo) => ds.campos[campo] && !ocultos.has(campo),
  );
  const cards = fields
    .map((campo) => makeCard(ds, campo, selected, rest))
    .filter((card) => card.options.length);
  if (ordenar) cards.sort((a, b) => b.diferencia - a.diferencia);
  return (
    <section className="distributions" aria-label="Distribuciones">
      <div className="distribution-head">
        <div>
          <p className="eyebrow">Vista comparativa</p>
          <h2>Seleccionadas frente a no seleccionadas</h2>
          <p className="muted">
            {selected.length.toLocaleString('es-CO')} seleccionadas ·{' '}
            {rest.length.toLocaleString('es-CO')} no seleccionadas
          </p>
          {filtros.seleccionado && (
            <p className="distribution-warning">
              Esta vista compara ambos grupos; el filtro Seleccionada no se aplica aquí.
            </p>
          )}
          {(selected.length < 30 || rest.length < 30) && (
            <p className="distribution-warning">Muestra pequeña: los porcentajes pueden engañar.</p>
          )}
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setOrdenar(!ordenar)}
        >
          {ordenar ? 'Orden original' : 'Mayor diferencia primero'}
        </button>
        <button type="button" className="button button-secondary" onClick={onClose}>
          Volver al Explorador
        </button>
      </div>
      <div className="distribution-grid">
        {cards.map((card) => (
          <article className="distribution-card" key={card.campo}>
            <h3>{LABELS[card.campo] ?? ds.campos[card.campo].etiqueta}</h3>
            {card.options.map((option) => (
              <div className="distribution-option" key={option.label}>
                <span className="distribution-label">{option.label}</span>
                <div className="distribution-line">
                  <span
                    className="distribution-bar distribution-selected"
                    style={{ width: `${option.selected}%` }}
                  />
                  <small>{formatPct(option.selected)}</small>
                </div>
                <div className="distribution-line">
                  <span
                    className="distribution-bar distribution-rest"
                    style={{ width: `${option.rest}%` }}
                  />
                  <small>{formatPct(option.rest)}</small>
                </div>
                <strong
                  className={option.diff >= 0 ? 'distribution-positive' : 'distribution-negative'}
                >
                  {option.diff >= 0 ? '+' : ''}
                  {formatPct(option.diff)} pp
                </strong>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

function makeCard(ds: Dataset, campo: string, selected: number[], rest: number[]) {
  const def = ds.campos[campo];
  const options =
    def.tipo === 'num'
      ? [
          ...rangosNumericos(ds, campo).map((r) => ({
            label: r.etiqueta,
            test: (v: unknown) => typeof v === 'number' && v >= r.min && v <= r.max,
          })),
          { label: 'Sin dato', test: (v: unknown) => v == null },
        ]
      : def.tipo === 'bool'
        ? [
            { label: 'No', test: (v: unknown) => v === 0 },
            { label: 'Sí', test: (v: unknown) => v === 1 },
          ]
        : (def.valores ?? []).map((label, index) => ({
            label,
            test: (v: unknown) => (Array.isArray(v) ? v.includes(index) : v === index),
          }));
  const result = options.map((option) => {
    const selectedPct = pct(
      selected.filter((i) => option.test(ds.columnas[campo]?.[i])).length,
      selected.length,
    );
    const restPct = pct(
      rest.filter((i) => option.test(ds.columnas[campo]?.[i])).length,
      rest.length,
    );
    return {
      label: option.label,
      selected: selectedPct,
      rest: restPct,
      diff: selectedPct - restPct,
    };
  });
  return {
    campo,
    options: result.filter((option) => option.selected > 0 || option.rest > 0),
    diferencia: Math.max(...result.map((o) => Math.abs(o.selected - o.rest)), 0),
  };
}

function pct(n: number, total: number) {
  return total ? (n / total) * 100 : 0;
}
function formatPct(value: number) {
  return `${value.toFixed(1).replace('.', ',')} %`;
}
