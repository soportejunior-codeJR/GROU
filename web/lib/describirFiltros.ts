import type { Dataset, Filtros } from './dataset';

export function describirFiltros(ds: Dataset, filtros: Filtros, labels: Record<string, string>) {
  return Object.entries(filtros)
    .map(([campo, filtro]) => {
      const label = labels[campo] ?? ds.campos[campo]?.etiqueta ?? campo;
      if (filtro.tipo === 'bool') return `${label}: ${filtro.valor ? 'Sí' : 'No'}`;
      if (filtro.tipo === 'num') {
        return `${label}: ${filtro.min}–${filtro.max}${filtro.incluirSinDato ? ' + Sin dato' : ''}`;
      }
      const values = filtro.valores.map((i) => ds.campos[campo].valores?.[i]).filter(Boolean);
      return `${label}: ${values.join(', ')}`;
    })
    .join(' · ');
}
