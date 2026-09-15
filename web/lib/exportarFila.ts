export type Respuesta = { p: string; k: string; r: string | null };

export type FilaCompleta = {
  id_publico: number;
  convocatoria: string;
  pais: string;
  seleccionado: boolean;
  cedula_norm: string | null;
  respuestas: Respuesta[];
};

const FIJAS = [
  ['ID público', (fila: FilaCompleta) => fila.id_publico],
  ['Convocatoria', (fila: FilaCompleta) => fila.convocatoria],
  ['País', (fila: FilaCompleta) => fila.pais],
  ['Seleccionada', (fila: FilaCompleta) => (fila.seleccionado ? 'Sí' : 'No')],
  ['Cédula normalizada', (fila: FilaCompleta) => fila.cedula_norm],
] as const;

export function escaparFormula(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/^[=@\t\r]/.test(text)) return `'${text}`;
  if (/^[+-]/.test(text) && !/^[-+][\d ]+$/.test(text)) return `'${text}`;
  return text;
}

export function escaparCsv(value: unknown): string {
  return `"${escaparFormula(value).replaceAll('"', '""')}"`;
}

function tituloPregunta(pregunta: string, clave: string): string {
  if (clave.includes('autorizacion de uso de datos')) return 'Autorización de uso de datos';
  let titulo = pregunta.replace(/\s+/g, ' ').trim();
  if (titulo.length > 90) {
    const corte = [titulo.indexOf('('), titulo.indexOf(':')]
      .filter((indice) => indice >= 0)
      .sort((a, b) => a - b)[0];
    if (corte !== undefined) titulo = titulo.slice(0, corte).trim();
  }
  return titulo.length > 90 ? `${titulo.slice(0, 87)}…` : titulo;
}

export function armarCsvFilaCompleta(filas: FilaCompleta[]): string {
  const preguntas: { k: string; titulo: string }[] = [];
  const vistas = new Set<string>();
  for (const fila of filas) {
    for (const respuesta of fila.respuestas) {
      if (vistas.has(respuesta.k)) continue;
      vistas.add(respuesta.k);
      preguntas.push({ k: respuesta.k, titulo: tituloPregunta(respuesta.p, respuesta.k) });
    }
  }
  const encabezados = preguntas.map(({ titulo }) => titulo);
  const usos = new Map<string, number>();
  const encabezadosUnicos = encabezados.map((titulo) => {
    const siguiente = (usos.get(titulo) ?? 0) + 1;
    usos.set(titulo, siguiente);
    return siguiente === 1 ? titulo : `${titulo} (${siguiente})`;
  });
  const lineas = [
    [...FIJAS.map(([titulo]) => titulo), ...encabezadosUnicos].map(escaparCsv).join(','),
  ];
  for (const fila of filas) {
    const respuestas = new Map(fila.respuestas.map((respuesta) => [respuesta.k, respuesta.r]));
    const valores = FIJAS.map(([, obtener]) => obtener(fila));
    lineas.push([...valores, ...preguntas.map(({ k }) => respuestas.get(k) ?? null)].map(escaparCsv).join(','));
  }
  return `\uFEFF${lineas.join('\n')}`;
}
