import type { Filtro, RangoNumerico } from './dataset';

export type OpcionFiltro =
  | { tipo: 'cat' | 'multi'; indice: number }
  | { tipo: 'bool'; valor: 0 | 1 }
  | { tipo: 'num'; rango: RangoNumerico }
  | { tipo: 'sin_dato' };

export function alternarFiltro(actual: Filtro | undefined, opcion: OpcionFiltro): Filtro | null {
  if (opcion.tipo === 'bool') {
    return actual?.tipo === 'bool' && actual.valor === opcion.valor ? null : opcion;
  }
  if (opcion.tipo === 'num') {
    const { min, max } = opcion.rango;
    if (
      actual?.tipo === 'num' &&
      actual.min === min &&
      actual.max === max &&
      !actual.incluirSinDato
    )
      return null;
    return { tipo: 'num', min, max, incluirSinDato: false };
  }
  if (opcion.tipo === 'sin_dato') {
    const base =
      actual?.tipo === 'num'
        ? actual
        : { tipo: 'num' as const, min: 0, max: 100, incluirSinDato: false };
    return { ...base, incluirSinDato: !base.incluirSinDato };
  }
  const valores =
    actual && (actual.tipo === 'cat' || actual.tipo === 'multi') ? actual.valores : [];
  const next = valores.includes(opcion.indice)
    ? valores.filter((i) => i !== opcion.indice)
    : [...valores, opcion.indice];
  return next.length ? { tipo: opcion.tipo, valores: next } : null;
}
