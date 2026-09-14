'use client';

import { useMemo } from 'react';
import { contarFacetas, type Dataset, type Filtros, type Modo } from '@/lib/dataset';
import GraficoFaceta from './GraficoFaceta';
import { LABELS } from './FiltroCard';

const HIDDEN = new Set([
  'id_publico',
  'edad_valida',
  'edad_estado',
  'promedio_escala',
  'promedio_estado',
  'nucleo_estado',
  'indice_activos_estado',
  'nucleo_es_tope',
]);

export default function Informe({
  ds,
  filtros,
  modo,
  indices,
  seleccionadas,
}: {
  ds: Dataset;
  filtros: Filtros;
  modo: Modo;
  indices: Int32Array;
  seleccionadas: number;
}) {
  const campos = useMemo(
    () =>
      Object.keys(ds.campos).filter((campo) => {
        if (HIDDEN.has(campo)) return false;
        const def = ds.campos[campo];
        if (def.tipo === 'num') {
          return Array.from(indices).some((i) => ds.columnas[campo]?.[i] != null);
        }
        return contarFacetas(ds, campo, filtros, modo).some((count) => count > 0);
      }),
    [ds, filtros, indices, modo],
  );
  const porcentaje = indices.length ? ((seleccionadas / indices.length) * 100).toFixed(1) : '0.0';
  const filtrosTexto = describirFiltros(ds, filtros);
  const url = typeof window === 'undefined' ? '' : window.location.href;
  const fecha = new Date().toLocaleString('es-CO');

  return (
    <section className="print-report" aria-label="Informe imprimible">
      <div className="report-header">
        <div>
          <p className="eyebrow">Fundación ROFÉ · Jóvenes creaTIvos</p>
          <h2>Informe de convocatoria</h2>
          <p className="report-context">
            {filtrosTexto || 'Sin filtros aplicados'}
          </p>
          <p className="muted">
            {indices.length.toLocaleString('es-CO')} de {ds.total.toLocaleString('es-CO')} ·{' '}
            {seleccionadas.toLocaleString('es-CO')} seleccionadas · {porcentaje.replace('.', ',')} %
          </p>
          <p className="muted">
            Modo: {modo === 'TODAS' ? 'cumple todas las condiciones' : 'cumple al menos una'} ·{' '}
            Generado: {fecha}
          </p>
          <p className="muted">Cifras del panel de convocatoria de Jóvenes creaTIvos.</p>
        </div>
        <button className="button button-primary no-print" onClick={() => window.print()}>
          Descargar PDF
        </button>
      </div>
      <div className="report-grid">
        {campos.map((campo) => (
          <article className="report-chart" key={campo}>
            <h3>{LABELS[campo] ?? ds.campos[campo].etiqueta}</h3>
            <GraficoFaceta ds={ds} campo={campo} filtros={filtros} modo={modo} />
          </article>
        ))}
      </div>
      <p className="print-url">URL del panel: {url}</p>
    </section>
  );
}

function describirFiltros(ds: Dataset, filtros: Filtros) {
  return Object.entries(filtros)
    .map(([campo, filtro]) => {
      const label = LABELS[campo] ?? ds.campos[campo]?.etiqueta ?? campo;
      if (filtro.tipo === 'bool') return `${label}: ${filtro.valor ? 'Sí' : 'No'}`;
      if (filtro.tipo === 'num') {
        return `${label}: ${filtro.min}–${filtro.max}${filtro.incluirSinDato ? ' + Sin dato' : ''}`;
      }
      const values = filtro.valores.map((i) => ds.campos[campo].valores?.[i]).filter(Boolean);
      return `${label}: ${values.join(', ')}`;
    })
    .join(' · ');
}
