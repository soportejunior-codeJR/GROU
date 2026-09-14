import type { Dataset, RangoNumerico } from './dataset';

export function rangosNumericos(ds: Dataset, campo: string): RangoNumerico[] {
  const def = ds.campos[campo];
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const porCampo: Record<string, RangoNumerico[]> = {
    estrato: [1, 2, 3, 4, 5, 6].map((valor) => ({
      min: valor,
      max: valor,
      etiqueta: String(valor),
    })),
    personas_nucleo: [1, 2, 3, 4, 5, 6]
      .map((valor) => ({ min: valor, max: valor, etiqueta: String(valor) }))
      .concat({ min: 7, max, etiqueta: '7 o más' }),
    edad: [
      { min, max: Math.min(max, 15), etiqueta: '15 o menos' },
      { min: 16, max: 17, etiqueta: '16–17' },
      { min: 18, max: 20, etiqueta: '18–20' },
      { min: 21, max: 24, etiqueta: '21–24' },
      { min: 25, max: 29, etiqueta: '25–29' },
      { min: 30, max, etiqueta: '30 o más' },
    ],
    indice_activos: [
      { min: 0, max: 25, etiqueta: '0–25' },
      { min: 26, max: 50, etiqueta: '26–50' },
      { min: 51, max: 75, etiqueta: '51–75' },
      { min: 76, max: 100, etiqueta: '76–100' },
    ],
    promedio_pct: [
      { min: 0, max: 59, etiqueta: 'Menos de 60' },
      { min: 60, max: 69, etiqueta: '60–69' },
      { min: 70, max: 79, etiqueta: '70–79' },
      { min: 80, max: 89, etiqueta: '80–89' },
      { min: 90, max: 100, etiqueta: '90–100' },
    ],
    pct_avance: [
      { min: 0, max: 25, etiqueta: '0–25' },
      { min: 26, max: 50, etiqueta: '26–50' },
      { min: 51, max: 75, etiqueta: '51–75' },
      { min: 76, max: 100, etiqueta: '76–100' },
    ],
    cursos_aprobados: [
      { min: 0, max: 0, etiqueta: '0' },
      { min: 1, max: 2, etiqueta: '1–2' },
      { min: 3, max: 5, etiqueta: '3–5' },
      { min: 6, max, etiqueta: '6 o más' },
    ],
  };
  const definidos = porCampo[campo];
  if (definidos)
    return definidos
      .filter((r) => r.max >= min && r.min <= max)
      .map((r) => ({ ...r, min: Math.max(r.min, min), max: Math.min(r.max, max) }));
  const unicos = Array.from(
    new Set(ds.columnas[campo].filter((v): v is number => typeof v === 'number')),
  ).sort((a, b) => a - b);
  if (unicos.length <= 10) return unicos.map((v) => ({ min: v, max: v, etiqueta: String(v) }));
  const ancho = Math.max(1, Math.ceil((max - min + 1) / 5));
  return Array.from({ length: 5 }, (_, i) => {
    const inicio = min + i * ancho;
    const fin = Math.min(max, inicio + ancho - 1);
    return { min: inicio, max: fin, etiqueta: `${inicio}–${fin}` };
  }).filter((r) => r.min <= r.max);
}
