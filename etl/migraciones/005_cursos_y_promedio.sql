-- GROU · T12
-- Idempotente. resultado_programa ya tiene cohorte y los tres campos de curso;
-- estos inserts hacen explícito que el promedio no se preguntó en 2026 CO/EC/PA.

alter table resultado_programa
  add column if not exists cohorte text;

insert into campo_no_preguntado (convocatoria, pais, campo, nota) values
  ('2026', 'CO', 'promedio_pct', 'El formulario 2026 de Colombia no preguntaba promedio escolar'),
  ('2026', 'EC', 'promedio_pct', 'El formulario 2026 de Ecuador no preguntaba promedio escolar'),
  ('2026', 'PA', 'promedio_pct', 'El formulario 2026 de Panamá no preguntaba promedio escolar')
on conflict (convocatoria, pais, campo) do nothing;
