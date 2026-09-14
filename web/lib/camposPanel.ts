import type { Dataset } from './dataset';

export const CAMPOS_TECNICOS_OCULTOS = new Set([
  'id_publico',
  'edad_valida',
  'edad_estado',
  'promedio_escala',
  'promedio_estado',
  'nucleo_estado',
  'indice_activos_estado',
  'nucleo_es_tope',
  'estrato',
  'horas_min',
  'horas_max',
  'codigo_embajador',
  'metodo_match',
  'duplicado_de',
]);

export function camposOcultos(ds: Dataset) {
  const ocultos = new Set(CAMPOS_TECNICOS_OCULTOS);
  const motivo = ds.campos.motivo_no_seleccion?.valores ?? [];
  if (motivo.length && motivo.every((v) => v.toLowerCase() === 'sin_fuente')) {
    ocultos.add('motivo_no_seleccion');
  }
  return ocultos;
}
