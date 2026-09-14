import type { Dataset } from '@/lib/dataset';

export default function Encabezado({
  ds,
  totalVigente,
  seleccionadas,
  exportar,
}: {
  ds: Dataset;
  totalVigente: number;
  seleccionadas: number;
  exportar: () => void;
}) {
  return (
    <div className="topline">
      <div>
        <p className="eyebrow">Fundación ROFÉ · JÓVENES creaTIvos</p>
        <h1>Explorador de convocatoria</h1>
        <p className="muted">
          {totalVigente.toLocaleString('es-CO')} de {ds.total.toLocaleString('es-CO')} postulaciones
          · {seleccionadas.toLocaleString('es-CO')} seleccionadas ·{' '}
          {totalVigente
            ? ((seleccionadas / totalVigente) * 100).toFixed(1).replace('.', ',')
            : '0,0'}
          % (M/N)
        </p>
      </div>
      <button onClick={exportar} style={secondary}>
        Exportar CSV sin PII
      </button>
    </div>
  );
}

const secondary: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 4,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
};
