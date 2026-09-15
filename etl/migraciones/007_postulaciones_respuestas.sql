-- Fila completa del formulario, tal como llegó. Solo service_role (export auditado).
create table if not exists public.postulaciones_respuestas (
  postulacion_id uuid primary key references public.postulaciones(id) on delete cascade,
  -- Arreglo ordenado: [{"p": pregunta original, "k": clave_pregunta(p), "r": respuesta|null}, ...]
  -- NO un objeto {pregunta: respuesta}: jsonb reordena las claves y se perdería el orden del formulario.
  respuestas     jsonb not null check (jsonb_typeof(respuestas) = 'array'),
  cargado_en     timestamptz not null default now()
);

alter table public.postulaciones_respuestas enable row level security;
revoke all on public.postulaciones_respuestas from anon, authenticated;
grant all on public.postulaciones_respuestas to service_role;

-- Auditoría: qué tipo de export se hizo.
alter table public.export_log add column if not exists alcance text;
