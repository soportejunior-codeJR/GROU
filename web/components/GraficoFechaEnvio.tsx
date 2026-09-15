'use client';

import { useMemo, useState } from 'react';
import {
  contarFacetas,
  filtrar,
  type Dataset,
  type Filtro,
  type Filtros,
  type Modo,
} from '@/lib/dataset';

type Props = {
  ds: Dataset;
  filtros: Filtros;
  modo: Modo;
  cambiar?: (campo: string, filtro: Filtro | null) => void;
};
type Punto = { fecha: string; count: number; selected: boolean };
type Ventana = { convocatoria: string; puntos: Punto[]; min: string; max: string };

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default function GraficoFechaEnvio({ ds, filtros, modo, cambiar }: Props) {
  const [granularidad, setGranularidad] = useState<'día' | 'semana'>('día');
  const [hovered, setHovered] = useState<string | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [rangoVacio, setRangoVacio] = useState(false);
  const fechas = ds.campos.fecha_envio.valores ?? [];
  const counts = useMemo(() => contarFacetas(ds, 'fecha_envio', filtros, modo), [ds, filtros, modo]);
  const ventanas = useMemo(() => construirVentanas(ds, counts, filtros.fecha_envio), [ds, counts, filtros.fecha_envio]);
  const max = Math.max(...ventanas.flatMap((v) => v.puntos.map((p) => p.count)), 1);
  const denominator = filtrar(ds, filtros, modo, 'fecha_envio').length;
  const actual = filtros.fecha_envio?.tipo === 'cat' ? filtros.fecha_envio.valores : [];
  const atajos = construirAtajos(fechas, ventanas);

  function seleccionar(indices: number[] | null) {
    cambiar?.('fecha_envio', indices && indices.length ? { tipo: 'cat', valores: indices } : null);
  }
  function rango(desde: string, hasta: string) {
    if (!desde || !hasta || desde > hasta) return;
    const indices = fechas.map((f, i) => (f >= desde && f <= hasta ? i : -1)).filter((i) => i >= 0);
    if (indices.length) {
      setRangoVacio(false);
      seleccionar(indices);
    } else setRangoVacio(true);
  }

  return (
    <div className="wave-chart">
      <div className="wave-controls no-print">
        <div className="wave-shortcuts" aria-label="Atajos de fecha">
          {atajos.map((atajo) => {
            const activo = atajo.indices.length === actual.length && atajo.indices.every((i) => actual.includes(i));
            return <button type="button" className="button button-secondary" key={atajo.label} aria-pressed={activo} onClick={() => seleccionar(atajo.indices.length ? atajo.indices : null)}>{atajo.label}</button>;
          })}
        </div>
        <div className="wave-range">
          <label>Desde <input type="date" value={desde} min={ventanas[0]?.min} max={ventanas.at(-1)?.max} onChange={(e) => { setDesde(e.target.value); rango(e.target.value, hasta); }} /></label>
          <label>Hasta <input type="date" value={hasta} min={ventanas[0]?.min} max={ventanas.at(-1)?.max} onChange={(e) => { setHasta(e.target.value); rango(desde, e.target.value); }} /></label>
        </div>
        <div className="wave-granularity" role="group" aria-label="Granularidad">
          {(['día', 'semana'] as const).map((opcion) => <button type="button" className="button button-secondary" key={opcion} aria-pressed={granularidad === opcion} onClick={() => setGranularidad(opcion)}>{opcion === 'día' ? 'Día' : 'Semana'}</button>)}
        </div>
      </div>
      {rangoVacio && <p className="chart-note">Sin postulaciones en ese rango</p>}
      <div className="wave-panels" role="img" aria-label={ventanas.map((v) => 'Convocatoria ' + v.convocatoria).join(' · ')}>
        {ventanas.map((ventana) => <WavePanel key={ventana.convocatoria} ventana={agrupar(ventana, granularidad)} max={max} onSelect={(fecha) => seleccionar(unirFecha(actual, fecha, fechas))} onRange={(a, b) => rango(a, b)} hovered={hovered} setHovered={setHovered} />)}
      </div>
      {hovered && <Tooltip fecha={hovered} ventanas={ventanas} denominator={denominator} />}
      <details className="wave-details">
        <summary>Ver datos por día</summary>
        <table><thead><tr><th>Convocatoria</th><th>Fecha</th><th>Postulaciones</th></tr></thead><tbody>{ventanas.flatMap((v) => v.puntos.map((p) => <tr key={v.convocatoria + p.fecha}><td>{v.convocatoria}</td><td>{formatearFecha(p.fecha)}</td><td>{p.count.toLocaleString('es-CO')}</td></tr>))}</tbody></table>
      </details>
    </div>
  );
}

function WavePanel({ ventana, max, onSelect, onRange, hovered, setHovered }: { ventana: Ventana; max: number; onSelect: (fecha: string) => void; onRange: (desde: string, hasta: string) => void; hovered: string | null; setHovered: (fecha: string | null) => void }) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const width = 640, height = 190, pad = 24;
  const points = ventana.puntos.map((p, i) => ({ ...p, x: pad + (i / Math.max(ventana.puntos.length - 1, 1)) * (width - pad * 2), y: height - pad - (p.count / max) * (height - pad * 2) }));
  const peak = points.reduce((a, b) => (b.count > a.count ? b : a), points[0]);
  const haySeleccion = ventana.puntos.some((p) => p.selected);
  return (
    <article className="wave-panel">
      <h3>Convocatoria {ventana.convocatoria} · {formatearFecha(ventana.min)} – {formatearFecha(ventana.max)}</h3>
      <svg viewBox={'0 0 ' + width + ' ' + height} className="wave-svg" aria-label={'Envíos de la convocatoria ' + ventana.convocatoria} onPointerDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const position = ((e.clientX - rect.left) / rect.width) * (points.length - 1); setDragStart(Math.max(0, Math.min(points.length - 1, Math.round(position)))); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={(e) => { if (dragStart === null || !e.buttons) return; const rect = e.currentTarget.getBoundingClientRect(); const position = ((e.clientX - rect.left) / rect.width) * (points.length - 1); const end = Math.max(0, Math.min(points.length - 1, Math.round(position))); const a = ventana.puntos[dragStart]?.fecha; const b = ventana.puntos[end]?.fecha; if (a && b) onRange(a < b ? a : b, a < b ? b : a); }} onPointerUp={() => setDragStart(null)} onPointerCancel={() => setDragStart(null)}>
        <path d={areaPath(points, height - pad)} className="wave-area" />
        {points.map((p) => <circle key={p.fecha} cx={p.x} cy={p.y} r="4" className={p.selected || !haySeleccion ? 'wave-point-selected' : 'wave-point-rest'} onClick={() => onSelect(p.fecha)} onPointerEnter={() => setHovered(p.fecha)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(p.fecha)} onBlur={() => setHovered(null)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(p.fecha); }} />)}
        {peak && <><circle cx={peak.x} cy={peak.y} r="6" className="wave-peak" /><text x={peak.x} y={Math.max(14, peak.y - 10)} textAnchor="middle" className="wave-peak-label">{formatearFechaCorta(peak.fecha)} · {peak.count.toLocaleString('es-CO')}</text></>}
      </svg>
      {hovered && <p className="chart-note">Punto seleccionado: {formatearFecha(hovered)}</p>}
    </article>
  );
}

function construirVentanas(ds: Dataset, counts: number[], filtro?: Filtro): Ventana[] {
  const fechas = ds.campos.fecha_envio.valores ?? [];
  const convValores = ds.campos.convocatoria.valores ?? [];
  const convCol = ds.columnas.convocatoria ?? [];
  const convFecha = new Map<string, string>();
  fechas.forEach((fecha, fechaIndex) => {
    const fila = (ds.columnas.fecha_envio ?? []).findIndex((v) => v === fechaIndex);
    const convIndex = fila >= 0 ? convCol[fila] : undefined;
    convFecha.set(fecha, typeof convIndex === 'number' ? convValores[convIndex] ?? inferirConvocatoria(fecha) : inferirConvocatoria(fecha));
  });
  const selected = filtro?.tipo === 'cat' ? filtro.valores : [];
  const groups = new Map<string, string[]>();
  fechas.forEach((fecha) => { const key = convFecha.get(fecha) ?? inferirConvocatoria(fecha); if (!groups.has(key)) groups.set(key, []); groups.get(key)?.push(fecha); });
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([convocatoria, valores]) => {
    const sorted = [...valores].sort();
    const min = sorted[0], max = sorted[sorted.length - 1];
    return { convocatoria, min, max, puntos: diasEntre(min, max).map((fecha) => { const i = fechas.indexOf(fecha); return { fecha, count: i >= 0 ? counts[i] ?? 0 : 0, selected: i >= 0 && selected.includes(i) }; }) };
  });
}

function construirAtajos(fechas: string[], ventanas: Ventana[]) {
  const resultado = [{ label: 'Todo', indices: [] as number[] }];
  ventanas.forEach((v) => resultado.push({ label: 'Convocatoria ' + v.convocatoria, indices: fechas.map((f, i) => f >= v.min && f <= v.max ? i : -1).filter((i) => i >= 0) }));
  const meses = new Map<string, number[]>();
  fechas.forEach((fecha, i) => { const key = fecha.slice(0, 7); if (!meses.has(key)) meses.set(key, []); meses.get(key)?.push(i); });
  meses.forEach((indices, key) => resultado.push({ label: MONTHS[Number(key.slice(5)) - 1] + ' ' + key.slice(0, 4), indices }));
  return resultado;
}

function agrupar(ventana: Ventana, granularidad: 'día' | 'semana'): Ventana {
  if (granularidad === 'día') return ventana;
  const groups = new Map<string, Punto>();
  ventana.puntos.forEach((p) => { const key = inicioSemana(p.fecha); const old = groups.get(key); groups.set(key, { fecha: key, count: (old?.count ?? 0) + p.count, selected: Boolean(old?.selected || p.selected) }); });
  const puntos = Array.from(groups.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { ...ventana, puntos, min: puntos[0]?.fecha ?? ventana.min, max: puntos.at(-1)?.fecha ?? ventana.max };
}

function areaPath(points: Array<Punto & { x: number; y: number }>, bottom: number) {
  if (!points.length) return '';
  const line = smoothPath(points);
  return line + ' L ' + points[points.length - 1].x + ' ' + bottom + ' L ' + points[0].x + ' ' + bottom + ' Z';
}
function smoothPath(points: Array<Punto & { x: number; y: number }>) {
  if (points.length < 2) return points.length ? 'M ' + points[0].x + ' ' + points[0].y : '';
  const slopes = points.map((p, i) => {
    const left = points[Math.max(0, i - 1)], right = points[Math.min(points.length - 1, i + 1)];
    return i === 0 ? (right.y - p.y) / (right.x - p.x) : i === points.length - 1 ? (p.y - left.y) / (p.x - left.x) : (right.y - left.y) / (right.x - left.x);
  });
  return points.map((p, i) => {
    if (i === 0) return 'M ' + p.x + ' ' + p.y;
    const prev = points[i - 1], dx = (p.x - prev.x) / 3;
    const c1 = { x: prev.x + dx, y: clamp(prev.y + slopes[i - 1] * dx, 24, 166) };
    const c2 = { x: p.x - dx, y: clamp(p.y - slopes[i] * dx, 24, 166) };
    return ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + p.x + ' ' + p.y;
  }).join('');
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function Tooltip({ fecha, ventanas, denominator }: { fecha: string; ventanas: Ventana[]; denominator: number }) {
  const punto = ventanas.flatMap((v) => v.puntos.map((p) => ({ ...p, convocatoria: v.convocatoria }))).find((p) => p.fecha === fecha);
  if (!punto) return null;
  const pct = denominator ? ((punto.count / denominator) * 100).toFixed(1).replace('.', ',') : '0,0';
  return <p className="wave-tooltip">{formatearFecha(fecha)} · {punto.count.toLocaleString('es-CO')} postulaciones · {pct} % del subconjunto</p>;
}
function diasEntre(desde: string, hasta: string) { const salida: string[] = []; let cursor = parseFecha(desde); const fin = parseFecha(hasta); while (cursor <= fin) { salida.push(formatoISO(cursor)); cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1)); } return salida; }
function parseFecha(fecha: string) { const [y, m, d] = fecha.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function formatoISO(fecha: Date) { return fecha.getUTCFullYear() + '-' + String(fecha.getUTCMonth() + 1).padStart(2, '0') + '-' + String(fecha.getUTCDate()).padStart(2, '0'); }
function inicioSemana(fecha: string) { const d = parseFecha(fecha); const dia = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - dia + 1); return formatoISO(d); }
function inferirConvocatoria(fecha: string) { return fecha < '2025-06-01' ? '2025' : '2026'; }
function formatearFecha(fecha: string) { return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(parseFecha(fecha)); }
function formatearFechaCorta(fecha: string) { return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(parseFecha(fecha)); }
function rangoDesde(indices: number[], fechas: string[]) { return indices.length ? fechas[Math.min(...indices)] ?? '' : ''; }
function rangoHasta(indices: number[], fechas: string[]) { return indices.length ? fechas[Math.max(...indices)] ?? '' : ''; }
function unirFecha(indices: number[], fecha: string, fechas: string[]) { const i = fechas.indexOf(fecha); return i < 0 ? indices : indices.includes(i) ? indices.filter((x) => x !== i) : [...indices, i].sort((a, b) => a - b); }
