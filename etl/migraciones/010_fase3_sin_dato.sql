-- GROU - Permite representar asistencia incierta y publica su estado contable.
alter table resultado_fase3 alter column asistio drop not null;

-- Vista completa basada en 009_fase3.sql. La nueva columna se agrega al final
-- para respetar la restricción de CREATE OR REPLACE VIEW.
create or replace view v_analisis_postulaciones as
select
  p.id_publico,
  p.convocatoria,
  p.pais,
  p.enviado_en::date as fecha_envio,
  p.enrutado_fuera_cobertura,
  case when np.np_ciudad then 'no_aplica'
       else coalesce(nullif(trim(p.ciudad_norm), ''), 'sin_dato') end as ciudad,
  p.edad,
  case when np.np_edad then 'no_aplica'
       when p.edad is null then 'sin_dato' else 'valor' end as edad_estado,
  coalesce(p.edad_valida, true) as edad_valida,
  case when np.np_genero then 'no_aplica'
       else coalesce(p.genero, 'sin_dato') end as genero,
  case when np.np_situacion_educativa then 'no_aplica'
       else coalesce(p.situacion_educativa, 'sin_dato') end as situacion_educativa,
  p.anio_grado,
  p.promedio_pct,
  p.promedio_escala,
  case when np.np_promedio then 'no_aplica'
       when p.promedio_pct is null then 'sin_dato' else 'valor' end as promedio_estado,
  case when np.np_condicion_laboral then 'no_aplica'
       else coalesce(p.condicion_laboral, 'sin_dato') end as condicion_laboral,
  case when np.np_emprendimiento then 'no_aplica'
       else coalesce(p.emprendimiento, 'sin_dato') end as emprendimiento,
  case when np.np_otros_programas then 'no_aplica'
       else coalesce(p.otros_programas, 'sin_dato') end as otros_programas,
  p.estrato,
  case when np.np_estrato then 'no_aplica'
       when p.estrato is null then 'sin_dato' else p.estrato::text end as estrato_cat,
  case when np.np_ingreso_hogar then 'no_aplica'
       else coalesce(p.ingreso_hogar, 'sin_dato') end as ingreso_hogar,
  p.personas_nucleo,
  p.nucleo_es_tope,
  case when np.np_personas_nucleo then 'no_aplica'
       when p.personas_nucleo is null then 'sin_dato' else 'valor' end as nucleo_estado,
  case when np.np_tipo_vivienda then 'no_aplica'
       else coalesce(p.tipo_vivienda, 'sin_dato') end as tipo_vivienda,
  p.indice_activos,
  case when np.np_indice_activos then 'no_aplica'
       when p.indice_activos is null then 'sin_dato' else 'valor' end as indice_activos_estado,
  case when np.np_tiene_internet then 'no_aplica'
       when p.tiene_internet is null then 'sin_dato'
       when p.tiene_internet then 'si' else 'no' end as tiene_internet,
  case when np.np_acceso_computador then 'no_aplica'
       else coalesce(p.acceso_computador, 'sin_dato') end as acceso_computador,
  case when np.np_horas then 'no_aplica'
       else coalesce(p.horas_semanales, 'sin_dato') end as horas_semanales,
  p.horas_min,
  p.horas_max,
  case when np.np_comodidad then 'no_aplica'
       else coalesce(p.comodidad_autonomo, 'sin_dato') end as comodidad_autonomo,
  case when np.np_nivel_software then 'no_aplica'
       else coalesce(p.nivel_software, 'sin_dato') end as nivel_software,
  case when np.np_nivel_ingles then 'no_aplica'
       else coalesce(p.nivel_ingles, 'sin_dato') end as nivel_ingles,
  case when np.np_embajador then 'no_aplica'
       when nullif(trim(p.codigo_embajador), '') is null then 'sin_codigo'
       else 'con_codigo' end as tiene_embajador,
  nullif(trim(p.codigo_embajador), '') as codigo_embajador,
  case when np.np_aplico_antes then 'no_aplica'
       when p.aplico_antes_jc is null then 'sin_dato'
       when p.aplico_antes_jc then 'si' else 'no' end as aplico_antes_jc,
  case when p.fue_beneficiario_antes is null then 'sin_dato'
       when p.fue_beneficiario_antes then 'si' else 'no' end as fue_beneficiario_antes,
  coalesce(rs.seleccionado, false) as seleccionado,
  coalesce(rs.fase_max_alcanzada, 'fase1') as fase_max_alcanzada,
  coalesce(rs.motivo_no_seleccion, 'sin_fuente') as motivo_no_seleccion,
  coalesce(rs.metodo_match, 'sin_match') as metodo_match,
  case when rp.postulacion_id is null then 'no_aplica'
       when rp.retirado is null then 'sin_dato'
       when rp.retirado then 'si' else 'no' end as retirado,
  rp.pct_avance,
  rp.cursos_inscritos,
  rp.cursos_aprobados,
  case when rp.postulacion_id is null then 'no_aplica'
       else coalesce(rp.estado_final, 'sin_dato') end as estado_final,
  case when np.np_segmentos then array['no_aplica']
       else coalesce(seg.vals, array['sin_dato']) end as segmentos,
  case when np.np_ocupaciones then array['no_aplica']
       else coalesce(ocu.vals, array['sin_dato']) end as ocupaciones,
  case when np.np_como_se_entero then array['no_aplica']
       else coalesce(cse.vals, array['sin_dato']) end as como_se_entero,
  rs.duplicado_de,
  rf2.prueba_completada,
  rf2.puntaje_prueba_pct,
  rf2.formulario_completado,
  rf2.preguntas_respondidas,
  rf2.respuestas_validas,
  rf2.pasa_fase2,
  rf3.grupo,
  rf3.panel,
  rf3.asistio,
  rf3.puntaje_capitan,
  rf3.puntaje_jurado1,
  rf3.puntaje_jurado2,
  rf3.total,
  rf3.puntaje_pct,
  case when rf3.postulacion_id is null then 'no_aplica'
       when rf3.asistio is null then 'sin_dato'
       when rf3.asistio then 'si' else 'no' end as fase3_asistio
from postulaciones p
left join v_campos_no_preguntados np
       on np.convocatoria = p.convocatoria and np.pais = p.pais
left join resultado_seleccion rs on rs.postulacion_id = p.id
left join resultado_programa rp on rp.postulacion_id = p.id
left join resultado_fase2 rf2 on rf2.postulacion_id = p.id
left join resultado_fase3 rf3 on rf3.postulacion_id = p.id
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
