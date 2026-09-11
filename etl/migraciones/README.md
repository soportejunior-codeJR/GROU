# etl/migraciones — el esquema de la base

Dos archivos, en este orden. Ambos son **idempotentes**: volver a correrlos no rompe nada.

| Archivo | Tarea | Que deja |
|---|---|---|
| `001_esquema_inicial.sql` | T3 | 12 tablas + indices + RLS deny-all |
| `002_vistas.sql` | T6 | `v_analisis_postulaciones` + 3 vistas de cuadre |

Proyecto destino: **`convocatoria-jc`** (`CONV_SUPABASE_URL`). No confundir con
`panel-datos-rofe`, que en este proyecto es solo lectura y solo en T5.

## Como aplicarlas

**Opcion A — SQL Editor (la mas rapida, no necesita nada instalado).**

1. Supabase → proyecto `convocatoria-jc` → **SQL Editor** → New query.
2. Pegar `001_esquema_inicial.sql` completo → Run. Debe terminar sin error.
3. Nueva query, pegar `002_vistas.sql` completo → Run.

**Opcion B — psql**, si se tiene la contrasena de la base (la que Supabase muestra
una sola vez al crear el proyecto):

```bash
psql "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
  -v ON_ERROR_STOP=1 -f 001_esquema_inicial.sql -f 002_vistas.sql
```

## Verificar que quedo bien (antes de cargar un solo dato)

En el SQL Editor:

```sql
select count(*) from information_schema.tables
 where table_schema='public' and table_type='BASE TABLE';          -- 12

select table_name from information_schema.views
 where table_schema='public' order by 1;                            -- 5 vistas

select * from campo_no_preguntado order by convocatoria, pais;      -- 10 filas semilla
```

Y la unica verificacion que de verdad importa, **con el anon key, no con el
service_role** (desde una terminal con `.env.local` cargado):

```bash
curl -s "$CONV_SUPABASE_URL/rest/v1/postulaciones_pii?select=*" \
     -H "apikey: $CONV_SUPABASE_ANON_KEY"
```

Tiene que responder **`permission denied`**. Si responde `[]`, la RLS esta mal
puesta: una lista vacia sobre una tabla vacia es un falso OK que se rompe solo el
dia que se carguen los datos. Es el test 11 de T7.

## Lo que ya se verifico

Las dos migraciones se aplicaron contra un PostgreSQL 16 limpio el 2026-09-11, dos
veces seguidas, con datos de prueba de CO/EC/UY y 2025/2026. Se comprobo:

- `estrato_cat` = `no_aplica` en EC/UY/PA y el valor real en CO.
- `nivel_ingles` = `no_aplica` solo en UY 2025; `sin_dato` donde se pregunto y no
  contestaron. Son dos cosas distintas y la vista las distingue.
- Las **21 facetas categoricas suman exactamente el universo** — ningun nulo se
  cae de un conteo (test 14 de T7).
- `count(resultado_seleccion) = count(postulaciones)`: el cruce enriquece el
  universo entero, no solo a los 832 (test 13).
- `anon` recibe `permission denied` en `postulaciones_pii` **y** en la vista;
  `service_role` lee ambas.

## Una nota sobre `campo_no_preguntado`

Es la tabla que le permite a la vista decir **`no_aplica`** en vez de `sin_dato`.
Viene con 10 filas semilla: el estrato fuera de Colombia (concepto colombiano) y
las 5 preguntas que el formulario de Uruguay 2025 no traia.

**T2 tiene que agregar aqui todo campo que detecte 100 % vacio en una fuente.** Si
no lo hace, el panel va a leer un hueco de formulario como abandono — que es
exactamente el error que ya nos costo interpretar mal las 949 filas "incompletas"
de 2025.
