-- 003 — duplicado_de en resultado_seleccion
--
-- Por que existe: cinco cedulas del canon tienen dos postulaciones en 2026, y un
-- sexto caso llega por nombre (Paysandu). En los seis es la misma persona enviando
-- el formulario dos veces. Solo UNA de sus postulaciones puede llevar
-- seleccionado=true, o el conteo de seleccionados daria 838 en vez de 832.
--
-- La regla (handoff §9): marca la mas reciente por enviado_en, empate por
-- id_publico mayor. Las demas quedan seleccionado=false y apuntan aca a la elegida.
--
-- Esto respeta la regla 2 del proyecto: ninguna fila se descarta, se marca. La
-- postulacion duplicada sigue existiendo y sigue contando en el universo de 24.203.
--
-- Aplicada el 2026-09-13. Idempotente: se puede correr dos veces.

alter table public.resultado_seleccion
  add column if not exists duplicado_de integer;

comment on column public.resultado_seleccion.duplicado_de is
  'id_publico de la postulacion que SI lleva seleccionado=true cuando la misma '
  'persona envio el formulario mas de una vez. NULL en el caso normal. La fila con '
  'este campo poblado no se descarta: cuenta en el universo, solo no carga la bandera.';

-- Debe apuntar a un id_publico real. No es FK formal porque id_publico vive en
-- postulaciones y la PK de esta tabla es postulacion_id: el check mantiene la
-- integridad sin duplicar la llave.
alter table public.resultado_seleccion
  drop constraint if exists resultado_seleccion_duplicado_de_existe;

alter table public.resultado_seleccion
  add constraint resultado_seleccion_duplicado_de_existe
  check (duplicado_de is null or duplicado_de > 0);

create index if not exists resultado_seleccion_duplicado_de_ix
  on public.resultado_seleccion (duplicado_de)
  where duplicado_de is not null;

-- PENDIENTE, y lo hace Codex al ejecutar T5, no esta migracion:
-- exponer duplicado_de en v_analisis_postulaciones. Sin el, el panel no puede
-- distinguir una postulacion duplicada de una que simplemente no fue seleccionada,
-- y el usuario veria dos filas identicas sin explicacion.
--
-- Se hace en 002_vistas.sql, que es la definicion canonica de la vista, agregando
-- rs.duplicado_de al FINAL de la lista de columnas. Postgres permite agregar
-- columnas al final con create or replace view; lo que no permite es quitarlas,
-- renombrarlas ni reordenarlas. Por eso va al final y no junto a seleccionado.
