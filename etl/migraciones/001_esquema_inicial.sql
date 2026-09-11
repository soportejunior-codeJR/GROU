-- ============================================================================
-- GROU · Panel de Convocatoria JC
-- 001_esquema_inicial.sql  —  T3 del spec (DDL + RLS deny-all)
--
-- Proyecto Supabase destino: convocatoria-jc  (NO panel-datos-rofe)
-- Aplicar UNA sola vez, completo, en el SQL Editor del proyecto nuevo.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- El principio que gobierna este esquema:
--   el universo son las ~22.163 POSTULACIONES, no los 832 matriculados.
--   `seleccionado` vive en una tabla aparte (resultado_seleccion) justamente
--   para que sea un ATRIBUTO que se pega al universo, nunca un recorte de el.
--   Por eso resultado_seleccion tiene una fila por postulacion, no 832.
--
-- Grano: una fila = una POSTULACION, no una persona. 719 personas postularon
--   en 2025 y en 2026, y hay 63 cedulas duplicadas dentro de 2026. Colapsar
--   por persona destruiria el dato de reintento, que es justo lo que se quiere
--   poder mirar.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Tabla nucleo
-- ----------------------------------------------------------------------------
create table if not exists postulaciones (
  id                        uuid primary key default gen_random_uuid(),
  id_publico                int  not null,
  convocatoria              text not null check (convocatoria in ('2025','2026')),
  pais                      text not null check (pais in ('CO','EC','UY','PA')),
  fuente                    text not null,
  fila_origen               int  not null,
  enviado_en                timestamptz,

  -- true = la fila solo trae marca temporal + ciudad porque el formulario
  -- expulsaba a quien elegia una ciudad sin programa. 949 casos en COL 2025.
  -- Es un insumo de expansion, no un postulante fallido: NO se descarta.
  enrutado_fuera_cobertura  boolean not null default false,

  ciudad_declarada          text,
  ciudad_norm               text,

  fecha_nacimiento          date,
  -- edad a la FECHA DE CIERRE de su convocatoria (2026-02-16 / 2025-02-17),
  -- nunca a hoy: si no, un filtro guardado deja de reproducirse manana.
  edad                      int,
  edad_valida               boolean,

  genero                    text,
  genero_texto_libre        text,

  situacion_educativa       text,
  anio_grado                int,
  promedio_academico        numeric,
  promedio_escala           int,   -- 100 en CO/EC, 12 en UY
  promedio_pct              numeric check (promedio_pct between 0 and 100),

  condicion_laboral         text,
  emprendimiento            text,
  otros_programas           text,

  -- Concepto colombiano. NULL fuera de CO, y la vista lo muestra como
  -- 'no_aplica' (distinto de 'sin_dato'). Jamas 0.
  estrato                   int check (estrato between 1 and 6),
  ingreso_hogar             text,
  personas_nucleo           int,
  nucleo_es_tope            boolean not null default false,  -- "7 o mas"
  tipo_vivienda             text,
  tipo_vivienda_crudo       text,

  -- Indice construido por nosotros (no es una pregunta del formulario):
  -- 50% elementos del hogar + 50% servicios. Formula en la vista y en el
  -- tooltip del panel. NULL, no 0, donde la fuente no pregunto.
  indice_activos            int check (indice_activos between 0 and 100),

  tiene_internet            boolean,
  acceso_computador         text,
  horas_semanales           text,
  horas_min                 int,
  horas_max                 int,
  comodidad_autonomo        text,
  nivel_software            text,
  nivel_ingles              text,

  codigo_embajador          text,
  aplico_antes_jc           boolean,
  fue_beneficiario_antes    boolean,
  autorizo_datos            boolean,

  cargado_en                timestamptz not null default now(),

  -- llave de idempotencia: el upsert de T4 va contra esta
  constraint postulaciones_origen_uk
    unique (convocatoria, pais, fuente, fila_origen)
);

create unique index if not exists postulaciones_id_publico_uk
  on postulaciones (id_publico);

create index if not exists postulaciones_conv_pais_ix on postulaciones (convocatoria, pais);
create index if not exists postulaciones_ciudad_ix    on postulaciones (ciudad_norm);
create index if not exists postulaciones_edad_ix      on postulaciones (edad);
create index if not exists postulaciones_estrato_ix   on postulaciones (estrato);

-- ----------------------------------------------------------------------------
-- 2. PII — tabla aparte, service_role unicamente
--    Nunca recibe una politica de lectura. Ni "solo para admins".
-- ----------------------------------------------------------------------------
create table if not exists postulaciones_pii (
  postulacion_id        uuid primary key references postulaciones(id) on delete cascade,
  cedula_tipo           text,
  cedula_cruda          text,
  -- solo digitos y SIN ceros a la izquierda: Ecuador escribe 0930005871 y el
  -- canon guarda 930005871. Sin el lstrip("0") se pierden 81 matches de 832.
  cedula_norm           text,
  cedula_invalida       boolean not null default false,
  nombres               text,
  apellidos             text,
  -- tokens ordenados alfabeticamente: nombres y apellidos vienen
  -- intercambiados entre fuentes y ordenar los tokens lo resuelve.
  nombre_norm           text,
  email                 text,
  celular               text,
  celular_alterno       text,
  direccion             text,
  barrio                text,
  comuna                text,
  institucion_educativa text,
  acudiente_nombre      text,
  acudiente_email       text,
  acudiente_telefono    text,
  acudiente_relacion    text
);

create index if not exists pii_cedula_norm_ix on postulaciones_pii (cedula_norm);
create index if not exists pii_nombre_norm_ix on postulaciones_pii (nombre_norm);

-- ----------------------------------------------------------------------------
-- 3. Multivalor
--    postulacion_como_se_entero NO estaba en el bloque DDL del spec pero la
--    vista de T6 la necesita (seg / ocu / cse). Queda declarada aqui.
-- ----------------------------------------------------------------------------
create table if not exists postulacion_segmentos (
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  valor          text not null,
  primary key (postulacion_id, valor)
);

create table if not exists postulacion_ocupaciones (
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  valor          text not null,
  primary key (postulacion_id, valor)
);

create table if not exists postulacion_elementos (
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  valor          text not null,
  primary key (postulacion_id, valor)
);

create table if not exists postulacion_servicios (
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  valor          text not null,
  primary key (postulacion_id, valor)
);

create table if not exists postulacion_como_se_entero (
  postulacion_id uuid not null references postulaciones(id) on delete cascade,
  valor          text not null,
  primary key (postulacion_id, valor)
);

-- ----------------------------------------------------------------------------
-- 4. Resultado del proceso de seleccion
--    UNA FILA POR POSTULACION, no 832. El cruce de T5 enriquece el universo
--    entero: sin match => seleccionado=false, jamas fila ausente.
--    El test 13 de T7 verifica count(resultado_seleccion)=count(postulaciones).
-- ----------------------------------------------------------------------------
create table if not exists resultado_seleccion (
  postulacion_id      uuid primary key references postulaciones(id) on delete cascade,
  seleccionado        boolean not null default false,
  fase_max_alcanzada  text not null default 'fase1'
    check (fase_max_alcanzada in ('fase1','fase2','fase3','entrevista','seleccionado','matriculado')),
  -- NULL a proposito: hoy no existe la fuente del motivo de rechazo.
  -- No se inventa. Se llena cuando el equipo entregue esa lista.
  motivo_no_seleccion text,
  metodo_match        text check (metodo_match in ('cedula','nombre','manual')),
  match_confianza     text check (match_confianza in ('alta','media','baja'))
);

create index if not exists resultado_seleccion_sel_ix on resultado_seleccion (seleccionado);

-- Solo para los matriculados: avance dentro del programa.
create table if not exists resultado_programa (
  postulacion_id   uuid primary key references postulaciones(id) on delete cascade,
  cedula_canon     text,
  cohorte          text,
  retirado         boolean,
  fecha_retiro     date,
  motivo_retiro    text,
  pct_avance       numeric,
  cursos_inscritos int,
  cursos_aprobados int,
  estado_final     text
);

-- ----------------------------------------------------------------------------
-- 5. Diccionarios corregibles sin recargar nada
-- ----------------------------------------------------------------------------
create table if not exists valor_alias (
  dominio        text not null,
  valor_crudo    text not null,
  valor_canonico text,
  n_ocurrencias  int  not null default 0,
  revisado       boolean not null default false,
  primary key (dominio, valor_crudo)
);

create table if not exists ciudad_alias (
  ciudad_cruda   text primary key,
  ciudad_norm    text,
  pais           text check (pais in ('CO','EC','UY','PA')),
  tiene_cobertura boolean not null default false
);

-- ----------------------------------------------------------------------------
-- 6. Que pregunta hizo cada formulario
--
--    "No contesto" y "nunca se le pregunto" son cosas distintas. Mezclarlas
--    inventaria un dato faltante donde solo hubo otro formulario. Esta tabla
--    es la que le permite a la vista decir 'no_aplica' en vez de 'sin_dato'.
--
--    T2 debe AGREGAR aqui todo campo que detecte 100% vacio en una fuente,
--    en vez de dejar que el panel lo lea como abandono.
-- ----------------------------------------------------------------------------
create table if not exists campo_no_preguntado (
  convocatoria text not null check (convocatoria in ('2025','2026')),
  pais         text not null check (pais in ('CO','EC','UY','PA')),
  campo        text not null,
  nota         text,
  primary key (convocatoria, pais, campo)
);

-- El estrato es un concepto colombiano: no existe en EC/UY/PA.
insert into campo_no_preguntado (convocatoria, pais, campo, nota) values
  ('2025','EC','estrato','El estrato es una clasificacion colombiana'),
  ('2025','UY','estrato','El estrato es una clasificacion colombiana'),
  ('2026','EC','estrato','El estrato es una clasificacion colombiana'),
  ('2026','UY','estrato','El estrato es una clasificacion colombiana'),
  ('2026','PA','estrato','El estrato es una clasificacion colombiana')
on conflict do nothing;

-- Uruguay 2025: el formulario no traia estas preguntas (columnas 100% vacias).
insert into campo_no_preguntado (convocatoria, pais, campo, nota) values
  ('2025','UY','tipo_vivienda',  'El formulario UY 2025 no lo preguntaba'),
  ('2025','UY','personas_nucleo','El formulario UY 2025 no lo preguntaba'),
  ('2025','UY','indice_activos', 'UY 2025 no preguntaba elementos ni servicios del hogar'),
  ('2025','UY','nivel_software', 'El formulario UY 2025 no lo preguntaba'),
  ('2025','UY','nivel_ingles',   'El formulario UY 2025 no lo preguntaba')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 7. RLS: deny-all en TODAS las tablas, sin una sola politica.
--
--    Sin politicas, anon y authenticated no leen nada; service_role pasa por
--    encima de RLS y es el unico que toca los datos (ETL y build del panel).
--
--    Verificacion obligatoria antes de dar T3 por cerrada (test 11 de T7):
--    con el anon key, postulaciones_pii tiene que responder PERMISSION DENIED,
--    no una lista vacia. Una lista vacia puede significar "RLS mal puesta pero
--    la tabla esta vacia", que es un falso OK que se rompe al cargar datos.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'postulaciones','postulaciones_pii',
    'postulacion_segmentos','postulacion_ocupaciones','postulacion_elementos',
    'postulacion_servicios','postulacion_como_se_entero',
    'resultado_seleccion','resultado_programa',
    'valor_alias','ciudad_alias','campo_no_preguntado'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    -- explicito, no heredado de los default privileges de Supabase: si algun
    -- dia cambian, el ETL no se cae en silencio con un permission denied.
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- El rol anonimo tampoco necesita crear nada en public.
revoke create on schema public from anon, authenticated;
