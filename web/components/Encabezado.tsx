import type { Dataset } from '@/lib/dataset';

export default function Encabezado({
  ds,
  totalVigente,
  seleccionadas,
  exportar,
  exportarPii,
}: {
  ds: Dataset;
  totalVigente: number;
  seleccionadas: number;
  exportar: () => void;
  exportarPii: () => void;
}) {
  return (
    <header className="topline">
      <div>
        <h2 className="topline-title">Explorador de convocatoria</h2>
        <p className="muted">
          {totalVigente.toLocaleString('es-CO')} de {ds.total.toLocaleString('es-CO')} postulaciones
          · {seleccionadas.toLocaleString('es-CO')} seleccionadas ·{' '}
          {totalVigente
            ? ((seleccionadas / totalVigente) * 100).toFixed(1).replace('.', ',')
            : '0,0'}
          % (M/N)
        </p>
      </div>
      <div className="export-actions">
        <button onClick={exportar} className="button button-secondary">
          Exportar CSV sin PII
        </button>
        <button onClick={exportarPii} className="button button-warning">
          Exportar con datos personales
        </button>
      </div>
    </header>
  );
}
