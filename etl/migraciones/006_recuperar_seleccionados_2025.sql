-- 006 — recuperar 7 seleccionados de la cohorte JC 2025
--
-- APLICADA el 2026-09-14. Se conserva como registro reproducible del arreglo.
-- Correr de nuevo no hace daño: son UPDATE idempotentes sobre filas concretas.
--
-- Por que: el cruce de 2025 marco 715 de las 723 personas del roster.
--   * 5 tenian la cedula mal digitada por el propio postulante y se recuperaron
--     por nombre normalizado, el mismo respaldo que ya usa el cruce de 2026.
--   * 2 tenian CEDULA EXACTA en postulaciones de 2025 y aun asi no se marcaron.
--     Eso no es un typo: es un fallo del cruce que hay que revisar aparte.
--   * 1 no tiene postulacion de Fase 1 ni por cedula ni por nombre. Probablemente
--     entro a la cohorte sin pasar por el formulario. No se puede recuperar sin
--     inventar, asi que la meta de 2025 es 722, no 723.
--
-- Resultado esperado: 2025 = 722 · 2026 = 832 · total 1554

-- Recuperar 7 seleccionados de la cohorte JC 2025 que el cruce no marco.
-- Generado 2026-09-14. Ver TOC-34 y la seccion 9 del HANDOFF-CODEX.md.

-- (a) 2 con cedula exacta en postulaciones 2025 que quedaron sin marcar
update resultado_seleccion set
  seleccionado = true, fase_max_alcanzada = 'matriculado',
  metodo_match = 'cedula', match_confianza = 'alta'
where postulacion_id in (
  'ba0df2f4-4fb9-4219-9f41-c68edcda0bac'::uuid,
  '05acf378-e738-44b3-8e2c-422bd48a0f9e'::uuid
);

-- (b) 5 recuperadas por nombre normalizado unico (cedula mal digitada)
update resultado_seleccion set
  seleccionado = true, fase_max_alcanzada = 'matriculado',
  metodo_match = 'nombre', match_confianza = 'media'
where postulacion_id in (
  'f041c730-46b1-453c-8cde-6aa78a4c441a'::uuid,
  '69aa13e7-89ee-4d5c-9924-40237e909b48'::uuid,
  '66f4dc58-c75d-4c60-a5c3-3e1eb453e194'::uuid,
  'ea03b75f-f005-4815-8f2d-c75f271372bc'::uuid,
  '78b912fa-2d92-4182-85ad-e56645555e40'::uuid
);

-- comprobacion: debe dar 2025=722, 2026=832
select p.convocatoria, count(*) filter (where rs.seleccionado) as seleccionados
from postulaciones p join resultado_seleccion rs on rs.postulacion_id = p.id
group by 1 order by 1;
