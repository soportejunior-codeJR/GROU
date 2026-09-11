-- ============================================================================
-- GROU · Panel de Convocatoria JC
-- 002_vistas.sql  —  T6 del spec
--
-- Aplicar DESPUES de 001_esquema_inicial.sql. Idempotente (create or replace).
--
-- Dos reglas que se materializan AQUI y no en el frontend:
--
--   1. `sin_dato` es una categoria, no un NULL que desaparece. Si un nulo se
--      cae de una faceta, los segmentos dejan de sumar N y el conteo miente
--      por omision. Al salir ya coalesced de la vista, las facetas suman el
--      universo por CONSTRUCCION y no por cuidado de quien escriba el grafico.
--
--   2. `sin_dato` no es `no_aplica`. "No contesto" y "nunca se le pregunto"
--      son cosas distintas: el estrato fuera de Colombia, y el nivel de ingles,
--      el software, la vivienda, el nucleo y el indice de activos en Uruguay
--      2025. La tabla campo_no_preguntado es la fuente de esa distincion.
--
-- Y una regla que se materializa por ausencia: NI UNA COLUMNA DE PII.
--   Ni nombre, ni correo, ni telefono, ni cedula, ni direccion, ni institucion
--   educativa (edad + ciudad + estrato + institucion reidentifica a un menor).
--   Si alguna vez hace falta agregar una columna aqui, la pregunta es si
--   reidentifica: son ~21.400 personas, muchas menores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Que pregunta hizo cada formulario, pivoteado a una fila por (convocatoria, pais)
-- ----------------------------------------------------------------------------
create or replace view v_campos_no_preguntados as
select convocatoria, pais,
       bool_or(campo = 'ciudad_norm')          as np_ciudad,
       bool_or(campo = 'genero')               as np_genero,
       bool_or(campo = 'situacion_educativa')  as np_situacion_educativa,
       bool_or(campo = 'promedio_pct')         as np_promedio,
       bool_or(campo = 'condicion_laboral')    as np_condicion_laboral,
       bool_or(campo = 'emprendimiento')       as np_emprendimiento,
       bool_or(campo = 'otros_programas')      as np_otros_programas,
       bool_or(campo = 'estrato')              as np_estrato,
       bool_or(campo = 'ingreso_hogar')        as np_ingreso_hogar,
       bool_or(campo = 'personas_nucleo')      as np_personas_nucleo,
       bool_or(campo = 'tipo_vivienda')        as np_tipo_vivienda,
       bool_or(campo = 'indice_activos')       as np_indice_activos,
       bool_or(campo = 'tiene_internet')       as np_tiene_internet,
       bool_or(campo = 'acceso_computador')    as np_acceso_computador,
       bool_or(campo = 'horas_semanales')      as np_horas,
       bool_or(campo = 'comodidad_autonomo')   as np_comodidad,
       bool_or(campo = 'nivel_software')       as np_nivel_software,
       bool_or(campo = 'nivel_ingles')         as np_nivel_ingles,
       bool_or(campo = 'codigo_embajador')     as np_embajador,
       bool_or(campo = 'aplico_antes_jc')      as np_aplico_antes,
       bool_or(campo = 'segmentos')            as np_segmentos,
       bool_or(campo = 'ocupaciones')          as np_ocupaciones,
       bool_or(campo = 'como_se_entero')       as np_como_se_entero,
       bool_or(campo = 'edad')                 as np_edad
from campo_no_preguntado
group by convocatoria, pais;

-- ----------------------------------------------------------------------------
-- LA vista que consume el panel.
--
-- Convencion de los campos categoricos: siempre text, nunca NULL.
--   valor real | 'sin_dato' (se pregunto, no contesto) | 'no_aplica' (no se pregunto)
--
-- Convencion de los numericos: el numero se conserva NULL para que los rangos
--   funcionen, y va acompanado de <campo>_estado con los mismos tres estados,
--   para que la faceta pueda contar los que no tienen valor sin esconderlos.
-- ----------------------------------------------------------------------------
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
       else coalesce(cse.vals, array['sin_dato']) end  as como_se_entero

from postulaciones p
left join v_campos_no_preguntados np
       on np.convocatoria = p.convocatoria and np.pais = p.pais
left join resultado_seleccion rs on rs.postulacion_id = p.id
left join resultado_programa  rp on rp.postulacion_id = p.id
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

-- ----------------------------------------------------------------------------
-- Cuadres. Para T7 y para el encabezado del panel.
-- ----------------------------------------------------------------------------

-- Cuantas postulaciones aporto cada fuente, y cuantas terminaron matriculadas.
create or replace view v_resumen_convocatoria as
select p.convocatoria,
       p.pais,
       p.fuente,
       count(*)                                                        as postulaciones,
       count(*) filter (where p.enrutado_fuera_cobertura)              as fuera_cobertura,
       count(*) filter (where coalesce(rs.seleccionado,false))         as seleccionados,
       round(100.0 * count(*) filter (where coalesce(rs.seleccionado,false))
             / nullif(count(*),0), 2)                                  as pct_seleccion,
       min(p.enviado_en)                                               as primer_envio,
       max(p.enviado_en)                                               as ultimo_envio
from postulaciones p
left join resultado_seleccion rs on rs.postulacion_id = p.id
group by p.convocatoria, p.pais, p.fuente;

-- Embudo por ciudad. Las fases 2 y 3 NO estan aqui a proposito: la fuente solo
-- las trae como conteos por ciudad, no por persona. Dibujar un embudo completo
-- insinuaria datos que no tenemos. Lo que falta se marca, no se rellena.
create or replace view v_embudo_ciudad as
select p.convocatoria,
       p.pais,
       coalesce(nullif(trim(p.ciudad_norm),''), 'sin_dato')            as ciudad,
       count(*)                                                        as postularon,
       count(*) filter (where p.enrutado_fuera_cobertura)              as enrutados_fuera,
       null::int                                                       as fase2_sin_fuente,
       null::int                                                       as fase3_sin_fuente,
       count(*) filter (where rs.fase_max_alcanzada = 'matriculado')   as matriculados,
       count(*) filter (where rp.retirado)                             as retirados
from postulaciones p
left join resultado_seleccion rs on rs.postulacion_id = p.id
left join resultado_programa  rp on rp.postulacion_id = p.id
group by 1,2,3;

-- % de respuesta por campo y por fuente. Hace visible de un vistazo que
-- pregunto cada formulario y que no: sin esto, un hueco de formulario se lee
-- como un cero y Panama parece haber respondido peor que nadie en 2025,
-- cuando sencillamente no existia en 2025.
create or replace view v_cobertura_campos as
select p.convocatoria,
       p.pais,
       p.fuente,
       kv.key                                                          as campo,
       count(*)                                                        as filas,
       count(*) filter (where kv.value <> 'null'::jsonb)               as con_dato,
       round(100.0 * count(*) filter (where kv.value <> 'null'::jsonb)
             / nullif(count(*),0), 1)                                  as pct_respuesta,
       exists (select 1 from campo_no_preguntado c
                where c.convocatoria = p.convocatoria
                  and c.pais = p.pais
                  and c.campo = kv.key)                                as no_preguntado
from postulaciones p
cross join lateral jsonb_each(
  to_jsonb(p) - 'id' - 'cargado_en' - 'fuente' - 'fila_origen'
             - 'convocatoria' - 'pais'
) kv
group by 1,2,3,4;

-- ----------------------------------------------------------------------------
-- Las vistas heredan la RLS de sus tablas (no la esquivan) y anon no las ve.
-- El dataset del panel lo hornea el build con service_role, no el navegador.
-- ----------------------------------------------------------------------------
alter view v_campos_no_preguntados  set (security_invoker = true);
alter view v_analisis_postulaciones set (security_invoker = true);
alter view v_resumen_convocatoria   set (security_invoker = true);
alter view v_embudo_ciudad          set (security_invoker = true);
alter view v_cobertura_campos       set (security_invoker = true);

revoke all on v_campos_no_preguntados,
              v_analisis_postulaciones,
              v_resumen_convocatoria,
              v_embudo_ciudad,
              v_cobertura_campos
  from anon, authenticated;

grant select on v_campos_no_preguntados,
                v_analisis_postulaciones,
                v_resumen_convocatoria,
                v_embudo_ciudad,
                v_cobertura_campos
  to service_role;
