'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { contarFacetas, filtrar, type Dataset, type Filtro, type Filtros, type Modo } from '@/lib/dataset';
import GraficoFaceta from './GraficoFaceta';
import { LABELS } from './FiltroCard';
import { camposOcultos } from '@/lib/camposPanel';
import { describirFiltros } from '@/lib/describirFiltros';

export default function Informe({
  ds,
  filtros,
  modo,
  indices,
  seleccionadas,
  cambiar,
}: {
  ds: Dataset;
  filtros: Filtros;
  modo: Modo;
  indices: Int32Array;
  seleccionadas: number;
  /** En pantalla los gráficos del informe filtran igual que los del Explorador (clic o toque). */
  cambiar: (campo: string, filtro: Filtro | null) => void;
}) {
  const campos = useMemo(
    () =>
      Object.keys(ds.campos).filter((campo) => {
        if (camposOcultos(ds).has(campo)) return false;
        const def = ds.campos[campo];
        if (filtros[campo]) return true;
        if (def.tipo === 'num') {
          const baseSinCampo = filtrar(ds, filtros, modo, campo);
          return Array.from(baseSinCampo).some((i) => ds.columnas[campo]?.[i] != null);
        }
        return contarFacetas(ds, campo, filtros, modo).some((count) => count > 0);
      }),
    [ds, filtros, indices, modo],
  );
  const porcentaje = indices.length ? ((seleccionadas / indices.length) * 100).toFixed(1) : '0.0';
  const filtrosTexto = describirFiltros(ds, filtros, LABELS);
  const url = typeof window === 'undefined' ? '' : window.location.href;
  const fecha = new Date().toLocaleString('es-CO');

  return (
    <section className="print-report" aria-label="Informe imprimible">
      <div className="report-header">
        <div>
          <Image src="/logo-rofe.png" alt="Fundación ROFÉ — Toca una vida" width={900} height={416} className="report-logo" />
          <p className="eyebrow">Fundación ROFÉ · Jóvenes creaTIvos</p>
          <h2>Informe de convocatoria</h2>
          <p className="report-context">{filtrosTexto || 'Sin filtros aplicados'}</p>
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
      <p className="report-hint no-print">Toca una gráfica para filtrar; el informe y el Explorador se actualizan juntos.</p>
      <div className="report-grid">
        {campos.map((campo) => (
          <article className={`report-chart${filtros[campo] ? ' report-chart-activa' : ''}`} key={campo}>
            <div className="report-chart-title">
              <h3>{LABELS[campo] ?? ds.campos[campo].etiqueta}</h3>
              {filtros[campo] && (
                <button type="button" className="clear no-print" onClick={() => cambiar(campo, null)}>
                  Quitar filtro
                </button>
              )}
            </div>
            <GraficoFaceta ds={ds} campo={campo} filtros={filtros} modo={modo} cambiar={cambiar} />
          </article>
        ))}
      </div>
      <p className="print-url">URL del panel: {url}</p>
    </section>
  );
}
