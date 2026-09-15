import assert from 'node:assert/strict';
import { armarCsvFilaCompleta } from '../lib/exportarFila.ts';

const longQuestion = `${'Pregunta sintética '.repeat(8)} (texto auxiliar)`;
const csv = armarCsvFilaCompleta([
  {
    id_publico: 1, convocatoria: '2026', pais: 'CO', seleccionado: true, cedula_norm: null,
    respuestas: [
      { p: 'Marca temporal', k: 'marca temporal', r: '2026-01-01' },
      { p: longQuestion, k: 'pregunta larga', r: '=2+2' },
      { p: 'Celular', k: 'celular', r: '+57 300 000 0000' },
    ],
  },
  {
    id_publico: 2, convocatoria: '2025', pais: 'EC', seleccionado: false, cedula_norm: '2',
    respuestas: [
      { p: 'Marca temporal', k: 'marca temporal', r: '2025-01-01' },
      { p: longQuestion, k: 'pregunta larga 2', r: '@texto' },
      { p: 'Otra pregunta', k: 'otra pregunta', r: 'valor' },
    ],
  },
]);
assert.match(csv, /"ID público","Convocatoria","País","Seleccionada","Cédula normalizada"/);
assert.match(csv, /'=2\+2/);
assert.match(csv, /\+57 300 000 0000/);
assert.match(csv, /'@texto/);
assert.match(csv, /… \(2\)/);
assert.equal(csv.split('\n').length, 3);
console.log('CSV sintético OK');
