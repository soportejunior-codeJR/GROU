'use client';

import type { CSSProperties } from 'react';

import { useMemo } from 'react';
import {
  contarFacetas,
  filtrar,
  type Dataset,
  type Filtro,
  type Filtros,
  type Modo,
} from '@/lib/dataset';
import { alternarFiltro } from '@/lib/filtros';
import { rangosNumericos } from '@/lib/rangosNumericos';

type Props = {
  ds: Dataset;
  campo: string;
  filtros: Filtros;
  modo: Modo;
  cambiar?: (campo: string, filtro: Filtro | null) => void;
};
type Item = { count: number; index: number; label: string };

export default function GraficoFaceta({ ds, campo, filtros, modo, cambiar }: Props) {
  const def = ds.campos[campo];
  const rangos = def.tipo === 'num' ? rangosNumericos(ds, campo) : [];
  const counts = useMemo(
    () => contarFacetas(ds, campo, filtros, modo, def.tipo === 'num' ? rangos : undefined),
    [ds, campo, filtros, modo, def.tipo, rangos],
  );
  const denominator = useMemo(
    () => filtrar(ds, filtros, modo, campo).length,
    [ds, campo, filtros, modo],
  );
  const selected = selectedValues(filtros[campo]);
  const labels = def.tipo === 'bool' ? ['No', 'Sí'] : (def.valores ?? []);
  if (def.tipo === 'num')
    return (
      <Histograma
        ds={ds}
        campo={campo}
        filtros={filtros}
        modo={modo}
        denominator={denominator}
        rangos={rangos}
        counts={counts}
        cambiar={cambiar}
      />
    );
  const visible = counts
    .map((count, index) => ({ count, index, label: labels[index] ?? String(index) }))
    .filter((item) => item.count > 0 || selected.includes(item.index));
  const chart =
    def.tipo === 'multi' || visible.length > 6 ? (
      <Barras
        items={visible}
        selected={selected}
        denominator={denominator}
        campo={campo}
        cambiar={cambiar}
        actual={filtros[campo]}
      />
    ) : (
      <Dona
        items={visible}
        selected={selected}
        denominator={denominator}
        campo={campo}
        cambiar={cambiar}
        actual={filtros[campo]}
      />
    );
  return (
    <div className="chart">
      <p className="chart-note">
        Conteo sobre los demás filtros{cambiar ? ' · clic para filtrar' : ''}
        {cambiar && modo === 'AL_MENOS_UNA' ? ' · cada clic suma personas' : ''}
      </p>
      {chart}
    </div>
  );
}

function Dona({
  items,
  selected,
  denominator,
  campo,
  cambiar,
  actual,
}: {
  items: Item[];
  selected: number[];
  denominator: number;
  campo: string;
  cambiar?: Props['cambiar'];
  actual?: Filtro;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 42 42" role="img" aria-label="Distribución de facetas">
        <circle className="donut-track" cx="21" cy="21" r="15.9" />
        <g transform="rotate(-90 21 21)">
          {items.map((item, position) => {
            const dash = total ? (item.count / total) * 100 : 0;
            const current = offset;
            offset += dash;
            return (
              <circle
                onClick={() =>
                  cambiar?.(campo, alternarFiltro(actual, { tipo: 'cat', indice: item.index }))
                }
                role={cambiar ? 'button' : undefined}
                className={selected.includes(item.index) ? 'donut-selected' : 'donut-rest'}
                key={item.index}
                cx="21"
                cy="21"
                r="15.9"
                pathLength="100"
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={-current}
                style={itemStyle(
                  campo,
                  item.label,
                  item.index,
                  position,
                  selected.includes(item.index),
                  'stroke',
                  Boolean(actual),
                )}
              />
            );
          })}
        </g>
        <text x="21" y="20" className="donut-total">
          {total.toLocaleString('es-CO')}
        </text>
        <text x="21" y="24" className="donut-caption">
          filas
        </text>
      </svg>
      <div className="chart-labels">
        {items.map((item, position) => (
          <button
            type="button"
            disabled={!cambiar}
            key={item.index}
            className={selected.includes(item.index) ? 'chart-label-selected' : ''}
            style={itemStyle(
              campo,
              item.label,
              item.index,
              position,
              selected.includes(item.index),
              'label',
              Boolean(actual),
            )}
            aria-pressed={selected.includes(item.index)}
            onClick={() =>
              cambiar?.(campo, alternarFiltro(actual, { tipo: 'cat', indice: item.index }))
            }
          >
            {item.label}: {formatCount(item.count, denominator)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Barras({
  items,
  selected,
  denominator,
  campo,
  cambiar,
  actual,
}: {
  items: Item[];
  selected: number[];
  denominator: number;
  campo: string;
  cambiar?: Props['cambiar'];
  actual?: Filtro;
}) {
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const shown =
    items.length > 20
      ? [
          ...sorted.slice(0, 10),
          {
            index: -1,
            label: 'Otras',
            count: sorted.slice(10).reduce((sum, item) => sum + item.count, 0),
          },
        ]
      : items;
  const max = Math.max(...shown.map((item) => item.count), 1);
  return (
    <div className="bars">
      {shown.map((item, position) => (
        <div
          className="bar-row"
          key={item.index}
          title={`${item.label}: ${formatCount(item.count, denominator)}`}
        >
          {item.index === -1 ? (
            <span className="bar-label">{item.label}</span>
          ) : (
            <button
              type="button"
              className="bar-label"
              aria-pressed={selected.includes(item.index)}
              aria-label={`${item.label}: ${formatCount(item.count, denominator)}`}
              onClick={() =>
                cambiar?.(campo, alternarFiltro(actual, { tipo: 'cat', indice: item.index }))
              }
            >
              {item.label}
            </button>
          )}
          <span
            onClick={() =>
              item.index >= 0 &&
              cambiar?.(campo, alternarFiltro(actual, { tipo: 'cat', indice: item.index }))
            }
            role={item.index >= 0 && cambiar ? 'button' : undefined}
            className={selected.includes(item.index) ? 'bar-selected' : 'bar-rest'}
            style={{
              width: `${(item.count / max) * 100}%`,
              ...itemStyle(
                campo,
                item.label,
                item.index,
                position,
                selected.includes(item.index),
                'fill',
                Boolean(actual),
              ),
            }}
          />
          <strong>{formatCount(item.count, denominator)}</strong>
        </div>
      ))}
    </div>
  );
}

function Histograma({
  ds,
  campo,
  filtros,
  modo,
  denominator,
  rangos,
  counts,
  cambiar,
}: Props & { denominator: number; rangos: ReturnType<typeof rangosNumericos>; counts: number[] }) {
  const base = useMemo(() => filtrar(ds, filtros, modo, campo), [ds, campo, filtros, modo]);
  const actual = filtros[campo];
  const maxCount = Math.max(...counts, 1);
  const bins = [
    ...rangos.map((rango, index) => ({ ...rango, count: counts[index] ?? 0, index })),
    {
      etiqueta: 'Sin dato',
      min: 0,
      max: 0,
      count: counts[rangos.length] ?? 0,
      index: rangos.length,
    },
  ];
  return (
    <div className="histogram">
      <p className="chart-note">
        Rango elegido · {formatCount(base.length, denominator)} filas
        {cambiar ? ' · clic para filtrar' : ''}
      </p>
      <div className="histogram-bars">
        {bins.map((bin) => (
          <div className="histogram-bin" key={bin.index} title={`${bin.etiqueta}: ${bin.count}`}>
            <button
              type="button"
              className="histogram-bar-button"
              disabled={
                !cambiar ||
                (bin.count === 0 &&
                  !(
                    actual?.tipo === 'num' &&
                    bin.index < rangos.length &&
                    actual.min <= bin.max &&
                    actual.max >= bin.min
                  ))
              }
              aria-pressed={
                actual?.tipo === 'num' &&
                (bin.index === rangos.length
                  ? actual.incluirSinDato
                  : actual.min <= bin.max && actual.max >= bin.min)
              }
              onClick={() =>
                cambiar?.(
                  campo,
                  bin.index === rangos.length
                    ? alternarFiltro(actual, { tipo: 'sin_dato' })
                    : alternarFiltro(actual, { tipo: 'num', rango: bin }),
                )
              }
              style={{
                height: `${(bin.count / maxCount) * 100}%`,
                backgroundColor: `var(--chart-muted-${(bin.index % 6) + 1})`,
              }}
            />
            <small>
              {bin.etiqueta}: {formatCount(bin.count, denominator)}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function selectedValues(filter: Filtros[string] | undefined) {
  if (filter?.tipo === 'bool') return [filter.valor];
  return filter && (filter.tipo === 'cat' || filter.tipo === 'multi') ? filter.valores : [];
}

function semanticStyle(
  campo: string,
  label: string,
  target: 'label' | 'stroke' | 'fill',
): CSSProperties {
  const value = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  let color: string | undefined;
  if (campo === 'seleccionado')
    color = value === 'si' ? 'var(--semantic-success)' : 'var(--semantic-neutral)';
  if (campo === 'retirado') {
    color =
      value === 'si'
        ? 'var(--semantic-danger)'
        : value === 'no'
          ? 'var(--semantic-success)'
          : 'var(--semantic-neutral)';
  }
  if (campo === 'enrutado_fuera_cobertura') {
    color = value === 'si' ? 'var(--semantic-warning)' : 'var(--semantic-neutral)';
  }
  if (campo === 'estado_final' || campo === 'fase_max_alcanzada') {
    if (value.includes('complet') || value.includes('seleccion')) color = 'var(--semantic-success)';
    else if (value.includes('curso')) color = 'var(--semantic-warning)';
    else if (value.includes('retir') || value.includes('iniciar')) color = 'var(--semantic-danger)';
  }
  if (!color) return {};
  if (target === 'stroke') return { stroke: color };
  if (target === 'fill') return { backgroundColor: color };
  return { color };
}

function itemStyle(
  campo: string,
  label: string,
  index: number,
  position: number,
  selected: boolean,
  target: 'label' | 'stroke' | 'fill',
  hasFilter: boolean,
): CSSProperties {
  const semantic = semanticStyle(campo, label, target);
  if (Object.keys(semantic).length) {
    const faded = hasFilter && !selected;
    return {
      ...semantic,
      opacity: faded ? 0.35 : 1,
      ...(target === 'label' && selected ? { fontWeight: 700 } : {}),
      ...(target === 'stroke' && selected ? { strokeWidth: 6 } : {}),
      ...(target === 'fill' && selected
        ? { outline: '2px solid currentColor', outlineOffset: '1px' }
        : {}),
    };
  }
  const color = selected ? 'var(--chart-selected)' : `var(--chart-muted-${(position % 6) + 1})`;
  if (target === 'stroke') return { stroke: color };
  if (target === 'fill') return { backgroundColor: color };
  return { color };
}

function formatCount(count: number, denominator: number) {
  const pct = denominator ? ((count / denominator) * 100).toFixed(1).replace('.', ',') : '0,0';
  return `${count.toLocaleString('es-CO')} (${pct} %)`;
}
