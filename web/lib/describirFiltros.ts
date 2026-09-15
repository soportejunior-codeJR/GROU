import type { Dataset, Filtros } from './dataset';

export function describirFiltros(ds: Dataset, filtros: Filtros, labels: Record<string, string>) {
  return Object.entries(filtros)
    .map(([campo, filtro]) => {
      const label = labels[campo] ?? ds.campos[campo]?.etiqueta ?? campo;
      if (filtro.tipo === 'bool') return `${label}: ${filtro.valor ? 'Sí' : 'No'}`;
      if (filtro.tipo === 'num') {
        return `${label}: ${filtro.min}–${filtro.max}${filtro.incluirSinDato ? ' + Sin dato' : ''}`;
      }
      if (campo === 'fecha_envio') return describirFechas(filtro.valores, ds.campos[campo].valores ?? [], label);
      const values = filtro.valores.map((i) => ds.campos[campo].valores?.[i]).filter(Boolean);
      return `${label}: ${values.join(', ')}`;
    })
    .join(' · ');
}

function describirFechas(indices: number[], valores: string[], label: string) {
  const fechas = indices.map((i) => valores[i]).filter(Boolean).sort();
  if (!fechas.length) return label + ': Sin dato';
  const tramos: string[][] = [];
  fechas.forEach((fecha) => {
    const anterior = tramos.at(-1)?.at(-1);
    if (!anterior || diferenciaDias(anterior, fecha) !== 1) tramos.push([fecha]);
    else tramos.at(-1)?.push(fecha);
  });
  return label + ': ' + tramos.map((tramo) => {
    const inicio = formatearFecha(tramo[0]);
    return tramo.length === 1 ? inicio : inicio + ' – ' + formatearFecha(tramo.at(-1)!) + ' (' + tramo.length + ' días)';
  }).join(', ');
}

function diferenciaDias(a: string, b: string) {
  return Math.round((parseFecha(b).getTime() - parseFecha(a).getTime()) / 86400000);
}
function parseFecha(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function formatearFecha(fecha: string) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(parseFecha(fecha));
}
