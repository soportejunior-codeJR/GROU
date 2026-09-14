import type { Dataset, Filtro, Filtros } from './dataset';

export function encodeFilter(f: Filtro) { if (f.tipo === 'cat' || f.tipo === 'multi') return `${f.tipo}:${f.valores.join('.')}`; if (f.tipo === 'bool') return `bool:${f.valor}`; return `num:${f.min},${f.max},${f.incluirSinDato ? 1 : 0}`; }

export function parseUrl(ds: Dataset): Filtros { const out: Filtros = {}; const q = new URLSearchParams(location.search); for (const [c, raw] of Array.from(q.entries())) { const d = ds.campos[c]; if (!d || c === 'modo') continue; const [kind, rest] = raw.split(':'); if (kind === 'cat' || kind === 'multi') out[c] = { tipo: kind, valores: rest.split('.').map(Number) } as Filtro; else if (kind === 'bool') out[c] = { tipo: 'bool', valor: Number(rest) as 0 | 1 }; else if (kind === 'num') { const [min, max, sin] = rest.split(',').map(Number); out[c] = { tipo: 'num', min, max, incluirSinDato: sin === 1 }; } } return out; }
