-- GROU · Fase 2
-- Tabla no-PII con resultados de seguimiento y extensión de la vista pública para service_role.

create table if not exists resultado_fase2 (
  postulacion_id uuid primary key references postulaciones(id) on delete cascade,
  prueba_completada boolean,
  puntaje_prueba_pct numeric,
  formulario_completado boolean,
  preguntas_respondidas int,
  respuestas_validas int,
  pasa_fase2 boolean not null
);

alter table resultado_fase2 enable row level security;
revoke all on resultado_fase2 from anon, authenticated;
grant all on resultado_fase2 to service_role;

create or replace view v_analisis_postulaciones as
select
  p.id_publico,
  p.convocatoria,
  p.pais,
  p.enviado_en::date                                   as fecha_envio,
  p.enrutado_fuera_cobertura,

  -- ── Identificacion y lugar ────────────────────────────────────────────────
  case when np.np_ciudad then 'no_aplica'
       else coalesce(nullif(trim(p.ciudad_norm), ''), 'sin_dato') end  as ciudad,

  -- ── Demografia ────────────────────────────────────────────────────────────
  p.edad,
  case when np.np_edad      then 'no_aplica'
       when p.edad is null  then 'sin_dato'
       else 'valor' end                                as edad_estado,
  -- false = fecha de nacimiento mal digitada (edad <10 o >80). El valor se
  -- conserva y se marca; no se borra la fila.
  coalesce(p.edad_valida, true)                        as edad_valida,

  case when np.np_genero then 'no_aplica'
       else coalesce(p.genero, 'sin_dato') end         as genero,

  -- ── Situacion educativa ───────────────────────────────────────────────────
  case when np.np_situacion_educativa then 'no_aplica'
       else coalesce(p.situacion_educativa, 'sin_dato') end as situacion_educativa,
  p.anio_grado,
  -- promedio normalizado a 0-100: Uruguay califica 1-12 y CO/EC 1-100. Sin
  -- normalizar, un filtro por promedio compara peras con manzanas.
  p.promedio_pct,
  p.promedio_escala,
  case when np.np_promedio         then 'no_aplica'
       when p.promedio_pct is null then 'sin_dato'
       else 'valor' end                                as promedio_estado,

  -- ── Situacion laboral ─────────────────────────────────────────────────────
  -- OJO: NULL aqui suele significar "no trabaja" (6.900 filas de COL 2026),
  -- no "no contesto". Sale como sin_dato y el panel lo rotula asi en el
  -- tooltip; no se convierte en una categoria inventada.
  case when np.np_condicion_laboral then 'no_aplica'
       else coalesce(p.condicion_laboral, 'sin_dato') end   as condicion_laboral,
  case when np.np_emprendimiento then 'no_aplica'
       else coalesce(p.emprendimiento, 'sin_dato') end      as emprendimiento,
  case when np.np_otros_programas then 'no_aplica'
       else coalesce(p.otros_programas, 'sin_dato') end     as otros_programas,

  -- ── Socioeconomico ────────────────────────────────────────────────────────
  p.estrato,
  case when np.np_estrato       then 'no_aplica'
       when p.estrato is null   then 'sin_dato'
       else p.estrato::text end                        as estrato_cat,
  case when np.np_ingreso_hogar then 'no_aplica'
       else coalesce(p.ingreso_hogar, 'sin_dato') end   as ingreso_hogar,
  p.personas_nucleo,
  p.nucleo_es_tope,
  case when np.np_personas_nucleo       then 'no_aplica'
       when p.personas_nucleo is null   then 'sin_dato'
       else 'valor' end                                as nucleo_estado,
  case when np.np_tipo_vivienda then 'no_aplica'
       else coalesce(p.tipo_vivienda, 'sin_dato') end   as tipo_vivienda,

  -- indice construido por nosotros, 0-100:
  --   50% elementos del hogar (Nevera 1, Estufa 1, TV 1, Lavadora 1.5,
  --       Horno 1.5, Equipo de sonido 1, Bicicleta 1, Moto 2, Carro 3; max 13)
  --   50% servicios (Energia, Agua, Gas, Alcantarillado, Recoleccion de
  --       basuras, Acceso pavimentado = 1 c/u; Acceso NO pavimentado resta 0.5
  --       porque es lo contrario de un activo, no un activo mas; max 6)
  -- No es una pregunta del formulario: el panel tiene que decirlo en el tooltip.
  p.indice_activos,
  case when np.np_indice_activos      then 'no_aplica'
       when p.indice_activos is null  then 'sin_dato'
       else 'valor' end                                as indice_activos_estado,

  -- ── Conectividad y disponibilidad ─────────────────────────────────────────
  case when np.np_tiene_internet     then 'no_aplica'
       when p.tiene_internet is null then 'sin_dato'
       when p.tiene_internet         then 'si' else 'no' end  as tiene_internet,
  case when np.np_acceso_computador then 'no_aplica'
       else coalesce(p.acceso_computador, 'sin_dato') end      as acceso_computador,
  case when np.np_horas then 'no_aplica'
       else coalesce(p.horas_semanales, 'sin_dato') end        as horas_semanales,
  p.horas_min,
  p.horas_max,
  case when np.np_comodidad then 'no_aplica'
       else coalesce(p.comodidad_autonomo, 'sin_dato') end     as comodidad_autonomo,
  case when np.np_nivel_software then 'no_aplica'
       else coalesce(p.nivel_software, 'sin_dato') end         as nivel_software,
  case when np.np_nivel_ingles then 'no_aplica'
       else coalesce(p.nivel_ingles, 'sin_dato') end           as nivel_ingles,

  -- ── Canal de entrada ──────────────────────────────────────────────────────
  case when np.np_embajador then 'no_aplica'
       when nullif(trim(p.codigo_embajador), '') is null then 'sin_codigo'
       else 'con_codigo' end                           as tiene_embajador,
  nullif(trim(p.codigo_embajador), '')                 as codigo_embajador,

  case when np.np_aplico_antes        then 'no_aplica'
       when p.aplico_antes_jc is null then 'sin_dato'
       when p.aplico_antes_jc         then 'si' else 'no' end  as aplico_antes_jc,
  case when p.fue_beneficiario_antes is null then 'sin_dato'
       when p.fue_beneficiario_antes then 'si' else 'no' end   as fue_beneficiario_antes,

  -- ── Resultado del proceso ─────────────────────────────────────────────────
  -- seleccionado es UN ATRIBUTO MAS. Los 832 son el 3,8% del universo:
  -- sirve para partir la poblacion en dos, nunca como denominador.
  coalesce(rs.seleccionado, false)                     as seleccionado,
  coalesce(rs.fase_max_alcanzada, 'fase1')             as fase_max_alcanzada,
  -- NULL a proposito hasta que exista la fuente del motivo de rechazo.
  coalesce(rs.motivo_no_seleccion, 'sin_fuente')       as motivo_no_seleccion,
  coalesce(rs.metodo_match, 'sin_match')               as metodo_match,

  -- ── Avance en el programa (solo matriculados) ─────────────────────────────
  case when rp.postulacion_id is null then 'no_aplica'
       when rp.retirado is null       then 'sin_dato'
       when rp.retirado               then 'si' else 'no' end   as retirado,
  rp.pct_avance,
  rp.cursos_inscritos,
  rp.cursos_aprobados,
  case when rp.postulacion_id is null then 'no_aplica'
       else coalesce(rp.estado_final, 'sin_dato') end           as estado_final,

  -- ── Multivalor ────────────────────────────────────────────────────────────
  -- vacio sale como {sin_dato} (o {no_aplica}) para que la faceta sume N.
  case when np.np_segmentos then array['no_aplica']
       else coalesce(seg.vals, array['sin_dato']) end  as segmentos,
  case when np.np_ocupaciones then array['no_aplica']
       else coalesce(ocu.vals, array['sin_dato']) end  as ocupaciones,
  case when np.np_como_se_entero then array['no_aplica']
       else coalesce(cse.vals, array['sin_dato']) end  as como_se_entero,
  rs.duplicado_de,
  rf2.prueba_completada,
  rf2.puntaje_prueba_pct,
  rf2.formulario_completado,
  rf2.preguntas_respondidas,
  rf2.respuestas_validas,
  rf2.pasa_fase2

from postulaciones p
left join v_campos_no_preguntados np
       on np.convocatoria = p.convocatoria and np.pais = p.pais
left join resultado_seleccion rs on rs.postulacion_id = p.id
left join resultado_programa  rp on rp.postulacion_id = p.id
left join resultado_fase2 rf2 on rf2.postulacion_id = p.id
left join lateral (
  select array_agg(s.valor order by s.valor) as vals
  from postulacion_segmentos s where s.postulacion_id = p.id
) seg on true
left join lateral (
  select array_agg(o.valor order by o.valor) as vals
  from postulacion_ocupaciones o where o.postulacion_id = p.id
) ocu on true
left join lateral (
  select array_agg(c.valor order by c.valor) as vals
  from postulacion_como_se_entero c where c.postulacion_id = p.id
) cse on true;




alter view v_analisis_postulaciones set (security_invoker = true);
revoke all on v_analisis_postulaciones from anon, authenticated;
grant select on v_analisis_postulaciones to service_role;

