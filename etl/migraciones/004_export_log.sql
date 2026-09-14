-- 004 — auditoría de exportaciones con PII
--
-- Registra quién exportó y cuántas filas, pero nunca los ids ni el contenido
-- exportado. La ruta /api/exportar-pii es la única consumidora prevista.

create table if not exists public.export_log (
  id          uuid primary key default gen_random_uuid(),
  correo      text not null,
  filas       integer not null,
  filtros     jsonb,
  creado_en   timestamptz not null default now()
);

create index if not exists export_log_creado_en_ix
  on public.export_log (creado_en desc);

alter table public.export_log enable row level security;
revoke all on public.export_log from anon, authenticated;
grant all on public.export_log to service_role;
