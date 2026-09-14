'use client';

import { useMemo, useState } from 'react';
import {
  contarFacetas,
  filtrar,
  type Dataset,
  type Filtro,
  type Filtros,
  type Modo,
} from '@/lib/dataset';
import GraficoFaceta from './GraficoFaceta';

export const LABELS: Record<string, string> = {
  convocatoria: 'Convocatoria',
  pais: 'País',
  ciudad: 'Ciudad',
  fecha_envio: 'Fecha de envío',
  edad: 'Edad',
  genero: 'Género',
  situacion_educativa: 'Situación educativa',
  promedio_pct: 'Promedio escolar',
  segmentos: 'Segmentos',
  ocupaciones: 'Ocupaciones',
  condicion_laboral: 'Condición laboral',
  emprendimiento: 'Emprendimiento',
  otros_programas: 'Otros programas',
  estrato: 'Estrato',
  ingreso_hogar: 'Ingreso del hogar',
  personas_nucleo: 'Personas en el núcleo',
  tipo_vivienda: 'Tipo de vivienda',
  indice_activos: 'Índice de activos',
  tiene_internet: 'Internet',
  acceso_computador: 'Acceso a computador',
  horas_semanales: 'Horas semanales',
  comodidad_autonomo: 'Comodidad aprendiendo',
  nivel_ingles: 'Nivel de inglés',
  nivel_software: 'Nivel de software',
  como_se_entero: 'Cómo se enteró',
  tiene_embajador: 'Embajador',
  seleccionado: 'Seleccionada',
  duplicado_de: 'Duplicado de',
  fase_max_alcanzada: 'Fase máxima',
  estado_final: 'Estado final',
  enrutado_fuera_cobertura: 'Fuera de cobertura',
  edad_valida: 'Edad válida',
  retirado: 'Retirada',
  pct_avance: 'Avance (%)',
  cursos_aprobados: 'Cursos aprobados',
  aplico_antes_jc: 'Aplicó antes a JC',
  fue_beneficiario_antes: 'Fue beneficiario antes',
  motivo_no_seleccion: 'Motivo de no selección',
  metodo_match: 'Método de cruce',
  formulario_incompleto: 'Formulario incompleto',
  ciudad_no_es_ciudad: 'Ciudad no válida',
  promedio_estado: 'Estado del promedio',
  edad_estado: 'Estado de la edad',
  estrato_cat: 'Estrato (categoría)',
  nucleo_estado: 'Estado del núcleo',
  indice_activos_estado: 'Estado del índice de activos',
  nivel_ingles_cat: 'Inglés (categoría)',
  nivel_software_cat: 'Software (categoría)',
  tipo_vivienda_cat: 'Vivienda (categoría)',
  fecha_envio_cat: 'Fecha de envío (categoría)',
  convocatoria_cat: 'Convocatoria (categoría)',
  pais_cat: 'País (categoría)',
  resultado_seleccion: 'Resultado de selección',
  duplicado_de_estado: 'Estado del duplicado',
  autorizo_datos: 'Autorizó datos',
  anio_grado: 'Año de grado',
  institucion_educativa: 'Institución educativa',
  comuna: 'Comuna',
  celular_alterno: 'Celular alterno',
  cedula_tipo: 'Tipo de cédula',
  cedula_invalida: 'Cédula inválida',
  nombre_norm: 'Nombre normalizado',
  fuente: 'Fuente',
  fila_origen: 'Fila de origen',
  actualizado_en: 'Actualizado en',
  creado_en: 'Creado en',
  id: 'ID interno',
  id_publico: 'ID público',
  ciudad_cruda: 'Ciudad escrita',
  pais_formulario: 'País del formulario',
  convocatoria_formulario: 'Convocatoria del formulario',
  enrutado: 'Enrutada',
  sin_dato: 'Sin dato',
  no_aplica: 'No aplica',
};

const INDICE_TOOLTIP =
  'Índice construido por nosotros: combina elementos del hogar (50 %) y servicios (50 %). No es una pregunta del formulario.';

export default function FiltroCard({
  ds,
  campo,
  filtros,
  cambiar,
  modo,
}: {
  ds: Dataset;
  campo: string;
  filtros: Filtros;
  cambiar: (c: string, f: Filtro | null) => void;
  modo: Modo;
}) {
  const [grafico, setGrafico] = useState(false);
  const def = ds.campos[campo];
  const actual = filtros[campo];
  const counts = useMemo(() => contarFacetas(ds, campo, filtros, modo), [ds, campo, filtros, modo]);
  const base = useMemo(() => filtrar(ds, filtros, modo, campo), [ds, campo, filtros, modo]);
  const label = LABELS[campo] ?? def.etiqueta;
  const activo = Boolean(actual);
  const tieneDatos =
    def.tipo === 'num'
      ? base.some((i) => ds.columnas[campo]?.[i] !== null && ds.columnas[campo]?.[i] !== undefined)
      : counts.some((count) => count > 0);
  if (!tieneDatos && !activo) return null;
  return (
    <fieldset
      className={`filter-card${grafico ? ' filter-card-chart' : ''}`}
      title={campo === 'indice_activos' ? INDICE_TOOLTIP : undefined}
    >
      <div className="card-head">
        <legend>{label}</legend>
        <button
          type="button"
          className={`chart-toggle${activo ? ' chart-toggle-active' : ''}`}
          onClick={() => setGrafico(!grafico)}
          aria-label={grafico ? `Volver a ${label}` : `Ver gráfico de ${label}`}
          aria-pressed={grafico}
        >
          ▥
        </button>
      </div>
      {grafico ? (
        <>
          <GraficoFaceta ds={ds} campo={campo} filtros={filtros} modo={modo} />
          {activo && (
            <div className="chart-footer">
              <span>Filtro activo</span>
              <button type="button" className="clear" onClick={() => cambiar(campo, null)}>
                × quitar
              </button>
            </div>
          )}
        </>
      ) : (
        <Control
          ds={ds}
          campo={campo}
          filtros={filtros}
          cambiar={cambiar}
          actual={actual}
          counts={counts}
          denominator={base.length}
        />
      )}
    </fieldset>
  );
}

function Control({
  ds,
  campo,
  filtros,
  cambiar,
  actual,
  counts,
  denominator,
}: {
  ds: Dataset;
  campo: string;
  filtros: Filtros;
  cambiar: (c: string, f: Filtro | null) => void;
  actual: Filtro | undefined;
  counts: number[];
  denominator: number;
}) {
  const def = ds.campos[campo];
  if (def.tipo === 'num') {
    const f =
      actual?.tipo === 'num'
        ? actual
        : { tipo: 'num' as const, min: def.min ?? 0, max: def.max ?? 100, incluirSinDato: false };
    return (
      <>
        <div className="range">
          <input
            type="number"
            value={f.min}
            min={def.min}
            max={def.max}
            onChange={(e) => cambiar(campo, { ...f, min: Number(e.target.value) })}
          />
          <span>–</span>
          <input
            type="number"
            value={f.max}
            min={def.min}
            max={def.max}
            onChange={(e) => cambiar(campo, { ...f, max: Number(e.target.value) })}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={f.incluirSinDato}
            onChange={(e) => cambiar(campo, { ...f, incluirSinDato: e.target.checked })}
          />{' '}
          Sin dato
        </label>
        {actual && (
          <button onClick={() => cambiar(campo, null)} className="clear">
            × quitar
          </button>
        )}
      </>
    );
  }
  if (def.tipo === 'bool') {
    const f = actual?.tipo === 'bool' ? actual : null;
    return (
      <>
        {[1, 0].map((v) => (
          <label className="check" key={v}>
            <input
              type="checkbox"
              checked={f?.valor === v}
              onChange={(e) =>
                cambiar(campo, e.target.checked ? { tipo: 'bool', valor: v as 0 | 1 } : null)
              }
            />{' '}
            {v ? 'Sí' : 'No'} <small>{formatearConteo(counts[v] ?? 0, denominator)}</small>
          </label>
        ))}
      </>
    );
  }
  const values = def.valores ?? [];
  const selected =
    actual && (actual.tipo === 'cat' || actual.tipo === 'multi') ? actual.valores : [];
  return (
    <div className="options">
      {values.map((value, i) =>
        (counts[i] > 0 || selected.includes(i)) && (
        <label className="check" key={value}>
          <input
            type="checkbox"
            checked={selected.includes(i)}
            onChange={(e) => {
              const next = e.target.checked ? [...selected, i] : selected.filter((x) => x !== i);
              cambiar(campo, next.length ? ({ tipo: def.tipo, valores: next } as Filtro) : null);
            }}
          />{' '}
          <span>{value}</span> <small>{formatearConteo(counts[i] ?? 0, denominator)}</small>
        </label>
        ),
      )}
    </div>
  );
}

function formatearConteo(count: number, denominator: number) {
  const pct = denominator ? ((count / denominator) * 100).toFixed(1).replace('.', ',') : '0,0';
  return `${count.toLocaleString('es-CO')} (${pct} %) `;
}
