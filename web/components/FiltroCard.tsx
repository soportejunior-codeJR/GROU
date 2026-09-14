'use client';

import { useMemo, useState } from 'react';
import {
  contarFacetas,
  filtrar,
  type Dataset,
  type Filtro,
  type Filtros,
  type Modo,
  type RangoNumerico,
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
  cursos_inscritos: 'Cursos inscritos',
  datos_curso: 'Datos de curso',
  envio_duplicado: 'Envío duplicado',
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
  numericosComoBotones,
}: {
  ds: Dataset;
  campo: string;
  filtros: Filtros;
  cambiar: (c: string, f: Filtro | null) => void;
  modo: Modo;
  numericosComoBotones: boolean;
}) {
  const [grafico, setGrafico] = useState(false);
  const def = ds.campos[campo];
  const actual = filtros[campo];
  const rangos = def.tipo === 'num' ? rangosNumericos(ds, campo) : [];
  const counts = useMemo(
    () => contarFacetas(ds, campo, filtros, modo, numericosComoBotones ? rangos : undefined),
    [ds, campo, filtros, modo, numericosComoBotones, rangos],
  );
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
          rangos={rangos}
          numericosComoBotones={numericosComoBotones}
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
  rangos,
  numericosComoBotones,
}: {
  ds: Dataset;
  campo: string;
  filtros: Filtros;
  cambiar: (c: string, f: Filtro | null) => void;
  actual: Filtro | undefined;
  counts: number[];
  denominator: number;
  rangos: RangoNumerico[];
  numericosComoBotones: boolean;
}) {
  const def = ds.campos[campo];
  if (def.tipo === 'num') {
    const f =
      actual?.tipo === 'num'
        ? actual
        : { tipo: 'num' as const, min: def.min ?? 0, max: def.max ?? 100, incluirSinDato: false };
    if (numericosComoBotones) {
      const seleccionado = actual?.tipo === 'num' ? actual : null;
      return (
        <div className="numeric-options">
          {rangos.map((rango, i) => {
            const activo =
              seleccionado !== null &&
              seleccionado.min <= rango.max &&
              seleccionado.max >= rango.min;
            return counts[i] > 0 || activo ? (
              <button
                type="button"
                className={`range-option${activo ? ' range-option-active' : ''}`}
                key={rango.etiqueta}
                onClick={() =>
                  cambiar(
                    campo,
                    activo
                      ? null
                      : { tipo: 'num', min: rango.min, max: rango.max, incluirSinDato: false },
                  )
                }
              >
                {rango.etiqueta} <small>{formatearConteo(counts[i] ?? 0, denominator)}</small>
              </button>
            ) : null;
          })}
          {counts[rangos.length] > 0 || (actual?.tipo === 'num' && actual.incluirSinDato) ? (
            <label className="range-option check">
              <input
                type="checkbox"
                checked={actual?.tipo === 'num' && actual.incluirSinDato}
                onChange={(e) => {
                  const f =
                    actual?.tipo === 'num'
                      ? actual
                      : {
                          tipo: 'num' as const,
                          min: rangos[0].min,
                          max: rangos[rangos.length - 1].max,
                          incluirSinDato: false,
                        };
                  cambiar(campo, { ...f, incluirSinDato: e.target.checked });
                }}
              />
              Sin dato <small>{formatearConteo(counts[rangos.length] ?? 0, denominator)}</small>
            </label>
          ) : null}
          {actual && (
            <button onClick={() => cambiar(campo, null)} className="clear">
              × quitar
            </button>
          )}
        </div>
      );
    }
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
        {(counts[1] > 0 || f.incluirSinDato) && (
          <label className="check">
            <input
              type="checkbox"
              checked={f.incluirSinDato}
              onChange={(e) => cambiar(campo, { ...f, incluirSinDato: e.target.checked })}
            />{' '}
            Sin dato
          </label>
        )}
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
      {values.map(
        (value, i) =>
          (counts[i] > 0 || selected.includes(i)) && (
            <label className="check" key={value}>
              <input
                type="checkbox"
                checked={selected.includes(i)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, i]
                    : selected.filter((x) => x !== i);
                  cambiar(
                    campo,
                    next.length ? ({ tipo: def.tipo, valores: next } as Filtro) : null,
                  );
                }}
              />{' '}
              <span>{value}</span> <small>{formatearConteo(counts[i] ?? 0, denominator)}</small>
            </label>
          ),
      )}
    </div>
  );
}

function rangosNumericos(ds: Dataset, campo: string): RangoNumerico[] {
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
      .map((valor) => ({
        min: valor,
        max: valor,
        etiqueta: String(valor),
      }))
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

function formatearConteo(count: number, denominator: number) {
  const pct = denominator ? ((count / denominator) * 100).toFixed(1).replace('.', ',') : '0,0';
  return `${count.toLocaleString('es-CO')} (${pct} %) `;
}
