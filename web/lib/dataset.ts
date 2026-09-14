// Contrato del dataset columnar. Lo PRODUCE scripts/construir-dataset.mjs y lo
// CONSUME el panel. Si cambia algo aqui, cambia alla: es el unico punto de acuerdo
// entre el build y la interfaz.
//
// Por que columnar y no un arreglo de objetos: 24.203 filas x ~30 campos en objetos
// JSON pesan ~12 MB; como diccionario de valores unicos + arreglos de indices bajan a
// ~1,5 MB comprimidos. Se carga una vez y todo el filtrado ocurre en memoria.

export type TipoCampo = 'cat' | 'multi' | 'num' | 'bool';

export interface DefinicionCampo {
  tipo: TipoCampo;
  etiqueta: string;
  /** Solo para 'cat' y 'multi': el diccionario de valores. Los indices apuntan aqui. */
  valores?: string[];
  /** Solo para 'num': limites reales, para armar el slider sin recorrer los datos. */
  min?: number;
  max?: number;
}

export interface Dataset {
  version: 1;
  generado_en: string;
  /** true cuando el build corrio sin credenciales y se sirvio el archivo de ejemplo. */
  es_ejemplo: boolean;
  /** Total de postulaciones. ESTE es el universo: nunca 832. */
  total: number;
  campos: Record<string, DefinicionCampo>;
  /**
   * Una entrada por campo, cada una con `total` posiciones:
   *   cat   -> number   (indice en campos[x].valores)
   *   multi -> number[] (indices; nunca vacio, lleva al menos SIN_DATO)
   *   num   -> number | null
   *   bool  -> 0 | 1
   */
  columnas: Record<string, (number | number[] | null)[]>;
}

/**
 * Categorias especiales. NO son lo mismo y no se deben agrupar:
 * - SIN_DATO: la pregunta existia y la persona no contesto.
 * - NO_APLICA: a esa persona nunca se le pregunto (estrato fuera de Colombia,
 *   ingles e indice de activos en Uruguay 2025).
 * Ambas son valores contables como cualquier otro, jamas un null que se cae del
 * grafico: toda segmentacion tiene que sumar el universo.
 */
export const SIN_DATO = 'Sin dato';
export const NO_APLICA = 'No aplica';

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export type Filtro =
  | { tipo: 'cat'; valores: number[] } // indices seleccionados (OR interno)
  | { tipo: 'multi'; valores: number[] } // coincide si comparte al menos uno
  | { tipo: 'num'; min: number; max: number; incluirSinDato: boolean }
  | { tipo: 'bool'; valor: 0 | 1 };

export type Modo = 'TODAS' | 'AL_MENOS_UNA';
export type Filtros = Record<string, Filtro>;
export type RangoNumerico = { min: number; max: number; etiqueta: string };

/** Evalua UN filtro contra UNA fila. */
function cumple(ds: Dataset, campo: string, filtro: Filtro, i: number): boolean {
  const col = ds.columnas[campo];
  if (!col) return true;
  const v = col[i];
  switch (filtro.tipo) {
    case 'cat':
      return filtro.valores.includes(v as number);
    case 'multi':
      return (v as number[]).some((x) => filtro.valores.includes(x));
    case 'num':
      if (v === null || v === undefined) return filtro.incluirSinDato;
      return (v as number) >= filtro.min && (v as number) <= filtro.max;
    case 'bool':
      return v === filtro.valor;
  }
}

/**
 * Devuelve los indices de fila que pasan los filtros.
 *
 * `omitir` excluye un campo de la evaluacion. Es lo que hace posible el conteo de
 * facetas: para saber cuanto sumaria cada opcion de un filtro, se cuenta sobre el
 * universo filtrado por todos los DEMAS filtros, no por el propio.
 */
export function filtrar(ds: Dataset, filtros: Filtros, modo: Modo, omitir?: string): Int32Array {
  const activos = Object.entries(filtros).filter(([c]) => c !== omitir);
  const salida = new Int32Array(ds.total);
  let n = 0;

  if (activos.length === 0) {
    for (let i = 0; i < ds.total; i++) salida[n++] = i;
    return salida.subarray(0, n);
  }

  for (let i = 0; i < ds.total; i++) {
    let pasa = modo === 'TODAS';
    for (const [campo, filtro] of activos) {
      const ok = cumple(ds, campo, filtro, i);
      if (modo === 'TODAS') {
        if (!ok) {
          pasa = false;
          break;
        }
      } else if (ok) {
        pasa = true;
        break;
      }
    }
    if (pasa) salida[n++] = i;
  }
  return salida.subarray(0, n);
}

/**
 * Conteo por opcion para UN campo, sobre el universo filtrado por los demas.
 * Esto es lo que hace que los filtros sean "en cascada" y no solo "encadenados":
 * el usuario ve cuanto sumaria cada opcion ANTES de marcarla, y una opcion que
 * quedaria en cero se muestra en cero en vez de desaparecer.
 *
 * Devuelve un arreglo alineado con campos[campo].valores, de modo que la suma de
 * todas sus posiciones es exactamente el tamano del universo vigente (para 'cat';
 * en 'multi' puede superarlo, porque una persona cuenta en varias categorias).
 * Para un campo numerico, `rangos` cambia el arreglo a los tramos indicados y anade
 * una ultima posicion para Sin dato.
 */
export function contarFacetas(
  ds: Dataset,
  campo: string,
  filtros: Filtros,
  modo: Modo,
  rangos?: RangoNumerico[],
): number[] {
  const def = ds.campos[campo];
  if (def.tipo === 'num' && rangos) {
    const cuenta = new Array<number>(rangos.length + 1).fill(0);
    const base = filtrar(ds, filtros, modo, campo);
    const col = ds.columnas[campo];
    for (let k = 0; k < base.length; k++) {
      const v = col[base[k]];
      if (typeof v !== 'number') {
        cuenta[rangos.length]++;
        continue;
      }
      const rango = rangos.findIndex((r) => v >= r.min && v <= r.max);
      if (rango >= 0) cuenta[rango]++;
    }
    return cuenta;
  }
  if (def.tipo === 'num') {
    const cuenta = [0, 0];
    const base = filtrar(ds, filtros, modo, campo);
    const col = ds.columnas[campo];
    for (let k = 0; k < base.length; k++) cuenta[col[base[k]] == null ? 1 : 0]++;
    return cuenta;
  }
  const cuenta = new Array<number>(def.valores?.length ?? 2).fill(0);
  const base = filtrar(ds, filtros, modo, campo);
  const col = ds.columnas[campo];

  for (let k = 0; k < base.length; k++) {
    const v = col[base[k]];
    if (Array.isArray(v)) {
      for (const idx of v) cuenta[idx]++;
    } else if (typeof v === 'number') {
      cuenta[v]++;
    }
  }
  return cuenta;
}
