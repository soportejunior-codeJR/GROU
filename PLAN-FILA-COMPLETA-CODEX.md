# Plan T20 — Exportar la fila completa del formulario

**Para:** Codex · **Redactado:** 2026-09-15 por Claude (arquitectura y QA) · **Issue:** TOC-57 (T20) en Linear

## Qué pidió el cliente

Samuel verificó en persona el export con datos personales: **todo lo que baja coincide con el
Sheet**. Ahora piden que, para las personas filtradas, el export traiga **la fila completa del
formulario**: todas las respuestas tal como llegaron, no solo los 9 campos de hoy.

## Por qué no es solo tocar el route (verificado 2026-09-15, no lo re-investigues)

- **La fila original no está en la base.** Supabase guarda la versión *normalizada*
  (`postulaciones`, `postulaciones_pii` y tablas multivalor). Preguntas enteras no llegaron a
  ninguna tabla: talla de camisa, lenguajes de programación, tipo de tenencia de la vivienda,
  condiciones laborales, entre otras.
- La fila completa **solo existe en local**: `etl/salida/raw_*.jsonl`, 8 archivos, UTF-8 con tildes
  reales, un objeto plano por línea. Vercel no puede leer archivos locales → hay que **cargarla a
  Supabase**.
- **Llave de unión, comprobada con conteos exactos:** cada línea cruda trae `_convocatoria`,
  `_pais`, `_fuente` y `_fila`, que son `convocatoria`, `pais`, `fuente` y `fila_origen` de
  `postulaciones` (la misma llave `on_conflict` de `cargar_convocatoria.py`):

| Archivo | Filas crudas | Filas en `postulaciones` con esa fuente |
|---|---:|---:|
| raw_2025_CO.jsonl (INTOCABLE) | 7.977 | 7.977 |
| raw_2025_CO-form1.jsonl | 90 | 90 |
| raw_2025_EC.jsonl | 2.213 | 2.213 |
| raw_2025_UY.jsonl | 351 | 351 |
| raw_2026_CO.jsonl | 11.356 | 11.356 |
| raw_2026_EC.jsonl | 1.430 | 1.430 |
| raw_2026_PA.jsonl | 567 | 567 |
| raw_2026_UY.jsonl | 219 | 219 |
| **Total** | **24.203** | **24.203** |

- Los formularios **no tienen las mismas preguntas**: entre 38 y 58 claves por archivo, **95
  preguntas distintas** en la unión y un máximo de **53** en un solo formulario.
- **Límite de Vercel:** una respuesta de función sin streaming tiene tope de **~4,5 MB**. Medido
  sobre los crudos, el CSV completo pesa en promedio 903 bytes por fila (p95 1.061, máx. 1.522):
  - 5.000 filas → **4,52 MB en promedio y 5,22 MB en el peor caso: no cabe**.
  - En 4 MB caben **3.795** filas en el peor caso → el límite pasa a **3.000**.

## Reglas

- Puerta de calidad en verde antes de cada commit (T7, `npm run build`, T11 6/6). Un commit por
  fase y push solo al final.
- **Esta vez sí hay una migración** (la 007, abajo, ya redactada). Aplícala con el mismo método que
  usaste para 003–006 y documéntalo en `etl/migraciones/README.md`.
- **Cero PII en el navegador:** `postulaciones_respuestas` **nunca** entra al dataset horneado ni a
  `/api/datos`. Solo la lee `/api/exportar-pii` con la service key.
- **No imprimas datos personales** en consola, logs, commits ni en tu reporte: solo conteos.
- **No pruebes el export con PII en producción.** Esa verificación es de Samuel.
- Si algo no cuadra (un crudo sin postulación, una postulación sin crudo, un conteo distinto de
  24.203): **bloqueo**. No escribas nada parcial.

---

## FASE 1 — Migración 007

`etl/migraciones/007_postulaciones_respuestas.sql`:

```sql
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
```

**Verificación:** con la anon key, `GET /rest/v1/postulaciones_respuestas` devuelve vacío o
error, **nunca filas**.

**Commit:** `feat(t20): migracion 007 respuestas crudas`

---

## FASE 2 — Cargador `etl/cargar_respuestas_crudas.py`

**Reutiliza, no reescribas:** `cargar_env_local()` y la clase `Supabase` de `cargar_convocatoria.py`
(paginación con `order=` ya resuelta) y `clave_pregunta()` de `normalizar_convocatoria.py`.
Impórtalos.

1. Leer los 8 `salida/raw_*.jsonl` con `encoding='utf-8'`.
2. Traer `postulaciones?select=id,convocatoria,pais,fuente,fila_origen&order=id` paginado y armar
   un mapa `(convocatoria, pais, fuente, fila_origen) → id`.
3. Por cada línea: llave `(_convocatoria, _pais, _fuente, int(_fila))`. Las respuestas se arman en
   **el orden de claves del archivo**, excluyendo `_fuente`, `_fila`, `_convocatoria`, `_pais`
   y `_pais_archivo`:
   - `p` = texto original de la pregunta, sin tocar
   - `k` = `clave_pregunta(p)`
   - `r` = respuesta como texto; `""` o `None` → `null`
   - **Solo en fuentes xlsx** (las que tienen `::` en `_fuente`): si `r` coincide con `^\d+\.0$`,
     quitar el `.0` (mismo gotcha del sufijo `.0` que ya rompió T4 una vez).
4. **Validación antes de escribir** (si falla cualquiera → salir con código 1 **sin escribir
   nada**):
   - 24.203 líneas crudas
   - cada línea encuentra exactamente una postulación
   - ninguna postulación queda sin línea
   - los conteos por fuente dan la tabla de arriba
5. Por defecto es **dry-run** (solo imprime conteos). Con `--escribir`: upsert por lotes de 500
   con `on_conflict=postulacion_id`. Idempotente: correrlo dos veces deja 24.203 filas.
6. **Salida:** conteos por fuente, total de preguntas distintas (esperado **95**) y máximo de
   preguntas por fila (esperado **53**). Nada de valores.

**Prueba 19** en `test_integridad_convocatoria.py`:
- `postulaciones_respuestas` tiene **24.203** filas y toda postulación tiene la suya
- el primer elemento de cada fila es `p = 'Marca temporal'`
- ninguna fila tiene un arreglo vacío

**Commit:** `feat(t20): cargador de respuestas crudas y prueba 19`

---

## FASE 3 — El export trae la fila completa

Archivo: `web/app/api/exportar-pii/route.ts` (y el botón en `app/page.tsx`).

### Consultas

- Agregar `postulaciones_respuestas` (`postulacion_id, respuestas`) a las consultas existentes.
- **Todas las consultas `.in(...)` en tandas de 500 ids.** Hoy van en una sola URL: con miles de
  ids se pasa del largo máximo de URL de PostgREST. Nunca se notó porque el export más grande
  probado fue de 319 filas.
- Si falta la fila cruda de alguna postulación → `409` *"Una o más postulaciones no tienen la fila
  completa cargada"*.

### Columnas del CSV (en este orden)

1. **Bloque fijo:** `ID público` · `Convocatoria` · `País` · `Seleccionada` · `Cédula normalizada`
   (`cedula_norm`, sirve para cruzar con otras bases).
2. **Bloque del formulario:** la unión de preguntas **de las filas exportadas**, por `k`, en orden
   de primera aparición recorriendo las filas en el orden de `ids`. Un export solo de Panamá no
   arrastra columnas que solo tiene Colombia. Una fila que no tiene esa pregunta deja la celda
   vacía.
   - **Encabezado** = `p` de la primera aparición con espacios colapsados. Si pasa de 90 caracteres,
     cortar en el primer `(` o `:`; si sigue largo, dejar 87 caracteres + `…`.
   - Si `k` contiene `autorizacion de uso de datos` → encabezado `Autorización de uso de datos`.
   - Si dos columnas terminan con el mismo encabezado → sufijo ` (2)`, ` (3)`.

### Seguridad del CSV

- Mantener el BOM UTF-8 al inicio del CSV (el `\uFEFF` que ya pone el route).
- **Inyección de fórmulas:** las respuestas son texto libre de un formulario público. Anteponer
  `'` a las celdas que empiezan con `=`, `@`, tabulación o retorno de carro, y a las que empiezan
  con `+` o `-` **salvo** que el resto sean solo dígitos y espacios. Así un celular `+57 300…` no
  se toca.

### Límite y auditoría

- `MAX_FILAS`: **5.000 → 3.000**, en el servidor (`413`) y en el aviso del cliente.
- **Guarda extra:** si el CSV armado pasa de **4.000.000 bytes** → `413` *"Filtra más: el archivo
  supera el tamaño permitido"*.
- `export_log`: insertar `alcance: 'fila_completa'`.
- Texto de confirmación: *"Vas a exportar N filas con la fila completa del formulario: todas las
  respuestas, incluidos datos personales y de acudientes. ¿Continuar?"*
- Archivo: `postulaciones_fila_completa.csv`.
- El export **sin PII** no cambia.

### Verificación sin tocar PII real

- Test local del armado del CSV con **filas sintéticas** (inventadas en el test): orden de
  columnas, unión de preguntas entre dos formularios, recorte de encabezados, sufijos, fórmula
  neutralizada y `+57 300` intacto.
- `npm run verificar-acceso` sigue en 6/6 (`/api/exportar-pii` sin sesión → 401).

**Commit:** `feat(t20): export con la fila completa del formulario`

---

## FASE 4 — Carga en producción y despliegue

1. `python etl/cargar_respuestas_crudas.py` (dry-run) → conteos correctos
2. `python etl/cargar_respuestas_crudas.py --escribir` → 24.203
3. Correrlo otra vez → sigue en 24.203 (idempotente)
4. Prueba 19 en verde
5. `git push origin main` → `npm run verificar-acceso` contra producción: **6/6**

---

## FASE 5 — Documentación

**En `GROU`:** `etl/README.md` (paso nuevo de la tubería y **cuándo re-correrlo**: siempre que se
regenere `payload.json` o se recargue T4), `etl/migraciones/README.md` (007) y una sección
*"Cierre T20"* en `HANDOFF-CODEX.md`.

**En `admin-usable`** (`git add` archivo por archivo, sin push):
- `docs/procesos/panel-convocatoria-jc.md` §16: qué quedó y los números
- `docs/procesos/mapa-codigo.md`: agregar `cargar_respuestas_crudas.py` en la sección GROU
- `claude_sessions.md`: entrada al final

**Commit:** `docs: cierre T20 fila completa`

---

## Queda para Samuel (no es tuyo)

- Exportar el **mismo filtro de 8 filas** del 2026-09-15 17:46 UTC y comparar **columna por
  columna** contra el Sheet, con tildes vistas en Excel
- Confirmar en `export_log` la fila nueva con `alcance = 'fila_completa'`

## Definición de terminado

- [ ] 007 aplicada y bloqueada para anon
- [ ] 24.203 filas crudas, idempotente, 95 preguntas, máx. 53
- [ ] Prueba 19 y T7 en verde
- [ ] Export con bloque fijo + unión de preguntas, tandas de 500, límite 3.000, guarda de 4 MB,
  fórmulas neutralizadas y `alcance` registrado
- [ ] Test sintético en verde, build limpio, T11 6/6 en producción
- [ ] Docs en ambos repos

## Formato del reporte final

```
## Fases
F1 ✅/❌ <commit> — una línea
…
## Números
crudas por fuente · total · preguntas distintas · máx por fila · prueba 19
## Desviaciones del plan
## Bloqueos
```
