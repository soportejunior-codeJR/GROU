'use client';

import { useMemo } from 'react';
import { contarFacetas, filtrar, type Dataset, type Filtros, type Modo } from '@/lib/dataset';

type Props = { ds: Dataset; campo: string; filtros: Filtros; modo: Modo };
type Item = { count: number; index: number; label: string };

export default function GraficoFaceta({ ds, campo, filtros, modo }: Props) {
  const def = ds.campos[campo];
  const counts = useMemo(() => contarFacetas(ds, campo, filtros, modo), [ds, campo, filtros, modo]);
  const denominator = useMemo(
    () => filtrar(ds, filtros, modo, campo).length,
    [ds, campo, filtros, modo],
  );
  const selected = selectedValues(filtros[campo]);
  const labels = def.valores ?? [];
  if (def.tipo === 'num')
    return (
      <Histograma ds={ds} campo={campo} filtros={filtros} modo={modo} denominator={denominator} />
    );
  const visible = counts
    .map((count, index) => ({ count, index, label: labels[index] ?? String(index) }))
    .filter((item) => item.count > 0 || selected.includes(item.index));
  const chart =
    def.tipo === 'multi' || visible.length > 6 ? (
      <Barras items={visible} selected={selected} denominator={denominator} />
    ) : (
      <Dona items={visible} selected={selected} denominator={denominator} />
    );
  return (
    <div className="chart">
      <p className="chart-note">Conteo sobre los demás filtros</p>
      {chart}
    </div>
  );
}

function Dona({
  items,
  selected,
  denominator,
}: {
  items: Item[];
  selected: number[];
  denominator: number;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 42 42" role="img" aria-label="Distribución de facetas">
        <circle className="donut-track" cx="21" cy="21" r="15.9" />
        <g transform="rotate(-90 21 21)">
          {items.map((item) => {
            const dash = total ? (item.count / total) * 100 : 0;
            const current = offset;
            offset += dash;
            return (
              <circle
                className={selected.includes(item.index) ? 'donut-selected' : 'donut-rest'}
                key={item.index}
                cx="21"
                cy="21"
                r="15.9"
                pathLength="100"
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={-current}
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
        {items.map((item) => (
          <span
            key={item.index}
            className={selected.includes(item.index) ? 'chart-label-selected' : ''}
          >
            {item.label}: {formatCount(item.count, denominator)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Barras({
  items,
  selected,
  denominator,
}: {
  items: Item[];
  selected: number[];
  denominator: number;
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
      {shown.map((item) => (
        <div
          className="bar-row"
          key={item.index}
          title={`${item.label}: ${formatCount(item.count, denominator)}`}
        >
          <span className="bar-label">{item.label}</span>
          <span
            className={selected.includes(item.index) ? 'bar-selected' : 'bar-rest'}
            style={{ width: `${(item.count / max) * 100}%` }}
          />
          <strong>{formatCount(item.count, denominator)}</strong>
        </div>
      ))}
    </div>
  );
}

function Histograma({ ds, campo, filtros, modo, denominator }: Props & { denominator: number }) {
  const base = useMemo(() => filtrar(ds, filtros, modo, campo), [ds, campo, filtros, modo]);
  const def = ds.campos[campo];
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const bins = Array.from({ length: 8 }, (_, index) => ({
    label: `${Math.round(min + ((max - min) * index) / 8)}–${Math.round(min + ((max - min) * (index + 1)) / 8)}`,
    count: 0,
    index,
  }));
  base.forEach((i) => {
    const value = ds.columnas[campo]?.[i];
    if (typeof value === 'number')
      bins[Math.min(7, Math.floor(((value - min) / Math.max(1, max - min)) * 8))].count++;
  });
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  return (
    <div className="histogram">
      <p className="chart-note">Rango elegido · {formatCount(base.length, denominator)} filas</p>
      <div className="histogram-bars">
        {bins.map((bin) => (
          <div className="histogram-bin" key={bin.index} title={`${bin.label}: ${bin.count}`}>
            <span style={{ height: `${(bin.count / maxCount) * 100}%` }} />
            <small>{bin.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function selectedValues(filter: Filtros[string] | undefined) {
  return filter && (filter.tipo === 'cat' || filter.tipo === 'multi') ? filter.valores : [];
}

function formatCount(count: number, denominator: number) {
  const pct = denominator ? ((count / denominator) * 100).toFixed(1).replace('.', ',') : '0,0';
  return `${count.toLocaleString('es-CO')} (${pct} %)`;
}
