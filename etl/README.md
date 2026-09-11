# etl — el back de GROU

Convierte 5 archivos de formularios en una base que puede responder cualquier combinacion de
filtros. De las 9 tareas del proyecto, 7 son de esta carpeta.

Contrato completo: `docs/procesos/panel-convocatoria-jc-spec-codex.md` en el repo `admin-usable`.

## Tuberia

```
Downloads/*.xlsx|*.csv
   │
   ├─ T1  extraer_convocatoria.py         -> salida/raw_<conv>_<pais>.jsonl     PENDIENTE
   ├─ T2  normalizar_convocatoria.py      -> salida/payload.json                PENDIENTE
   │                                         + salida/preguntas_sin_mapear.txt
   ├─ T3  migraciones/001_esquema_inicial.sql   (DDL + RLS deny-all)            LISTO
   ├─ T4  cargar_convocatoria.py          -> Supabase convocatoria-jc           PENDIENTE
   ├─ T5  cruzar_canon.py                 -> resultado_seleccion + resultado_programa  PENDIENTE
   ├─ T6  migraciones/002_vistas.sql      (v_analisis_postulaciones + cuadres)  LISTO
   └─ T7  test_integridad_convocatoria.py (15 pruebas; sale != 0 si algo falla) PENDIENTE
```

**T3 y T6 ya estan escritas y verificadas** contra un PostgreSQL 16 limpio: se aplican
dos veces seguidas sin romper, las 21 facetas categoricas suman el universo, `anon`
recibe `permission denied` en la PII y en la vista. Ver `migraciones/README.md` para
aplicarlas y para lo que hay que revisar antes de cargar el primer dato.

El esquema trae una tabla que el spec original no listaba y la vista si necesitaba:
`postulacion_como_se_entero`. Y una que no estaba en ningun lado, `campo_no_preguntado`,
que es la que le permite a la vista distinguir **"no contesto"** de **"nunca se le
pregunto"**. T2 tiene que alimentarla.

`salida/` esta gitignoreado: contiene PII.

## Reglas

- `truststore.inject_into_ssl()` como primera linea de cada script (proxy corporativo con SSL MITM).
- Credenciales desde `.env.local` de la raiz del proyecto con `cargar_env_local()`, no python-dotenv.
- Toda paginacion REST con `order=` explicito. Sin el se duplican filas entre paginas
  (incidente real, 2026-09-08).
- Todo cargador idempotente: correrlo dos veces seguidas deja el mismo estado.
- **Ninguna fila se descarta nunca.** Ver el principio en el README de la raiz.

## Dos bases, dos roles

| Variable | Proyecto | Para que |
|---|---|---|
| `CONV_SUPABASE_*` | `convocatoria-jc` (propio) | Lectura y escritura. Es la base de GROU. |
| `PANEL_SUPABASE_*` | `panel-datos-rofe` | **Solo lectura**, y solo en T5: `cohorte_2026_ceds`, `retiros`, avance. Nunca se escribe ahi. |
