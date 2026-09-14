# Plan de cierre — GROU / Panel de Convocatoria JC

**Para:** Codex · **Redactado:** 2026-09-14 por Claude (arquitectura y QA) · **Entrega beta:** 2026-09-17

Este es **el único plan que tienes que seguir** para terminar el proyecto. Se ejecuta de corrido,
fase tras fase, sin esperar confirmación entre una y otra. `HANDOFF-CODEX.md` queda como
**referencia** (contratos, reglas y el porqué de cada decisión); cuando este plan cite `§T12` o `§T17`,
es una sección de ese archivo.

---

## 0. Cómo se ejecuta este plan

1. **Continuo.** Terminas una fase, verificas su puerta de calidad, haces commit y sigues con la
   siguiente. No te detengas a pedir permiso.
2. **Puerta de calidad al final de CADA fase** — las tres en verde antes del commit:
   ```bash
   cd etl && python test_integridad_convocatoria.py      # T7 OK: fallas=0
   cd web && npm run build                               # prebuild hornea el dataset real
   cd web && npm run verificar-acceso                    # T11 OK: 6/6
   ```
   Si el build hornea `es_ejemplo: true`, **para**: faltan credenciales en `.env.local`, no sigas
   con un dataset de ejemplo.
3. **Un commit por fase**, estilo del repo: `feat(t17): …`, `fix(t12): …`, `docs: …`. No mezcles
   fases en un commit: si una sale mal, se revierte sola.
4. **Push solo en la Fase 5.** Cada push a `main` redespliega producción.
5. **Si una tarea se bloquea** (dato que no cuadra, credencial que falta, algo que pide decidir
   por el cliente): **no adivines**. Anótala en la sección *Bloqueos* de tu reporte final, deja esa
   tarea sin hacer y **sigue con la siguiente que no dependa de ella**.
6. **Sin migraciones SQL.** Nada de este plan necesita tocar el esquema: todo se deriva en
   `web/scripts/construir-dataset.mjs` o en la interfaz. Si crees que algo sí lo necesita, es un
   bloqueo (punto 5).

### Reglas que no se negocian (resumen de §3 del handoff)

- **El universo son las 24.203 postulaciones.** Ninguna fila se descarta; `seleccionado` es un
  atributo para partir la población, nunca un denominador.
- **`Sin dato` ≠ `No aplica`.** "No contestó" y "nunca se le preguntó" son categorías distintas y
  contables. Un campo de curso para quien no entró al programa es `No aplica`, **nunca 0**.
- **Cero PII en el navegador.** El dataset horneado no lleva cédula, nombre, correo ni celular.
- **Paginación REST siempre con `order=`.** Todo cargador, idempotente.
- `panel-datos-rofe` es **solo lectura**.

---

## 1. Estado verificado el 2026-09-14 — NO lo rehagas

Comprobado ejecutando, no leído de un reporte:

| Qué | Evidencia |
|---|---|
| Suite de integridad | `T7 OK: fallas=0`, 17 pruebas (incluye la 16: dataset contra base, y la 17: métricas de curso) |
| Verificador externo (T11) | `T11 OK: 6/6` contra `https://grou-tvsk.vercel.app`, sin sesión |
| Vercel Authentication | Apagado: `/` → 200, `/api/datos` → 401 **de la app** |
| Canon | 2025 = 722 · 2026 = 832 · 1.554 seleccionadas |
| Edad | Rango 10–66 sobre `edad_valida`; 22.384 con valor |
| Datos de curso | `pct_avance` y `cursos_aprobados` en 1.335 filas (559 de 2025 + 776 de 2026) |
| Promedio | `no_aplica` 13.353 · `sin_dato` 1.826 · valor 9.024 |
| T13 informe, T14 botones de rango, T15/T16 color y fondo | Commiteados; `main` = `origin/main` |
| Porcentaje junto a cada conteo, opciones en 0 escondidas, tooltip de índice de activos | Presentes en `FiltroCard.tsx` |

---

## FASE 1 — Cerrar lo que quedó abierto de T12

Referencia: `§T12`. Son huecos reales encontrados al auditar el dataset horneado.

### 1.1 `cursos_inscritos` se hornea como categoría

Falta en `NUMERICOS` (`construir-dataset.mjs:47`). Hoy sale como `cat` con valores `"6"…"12"`, así
que no tiene rango ni botones y ordena como texto. Agrégalo a `NUMERICOS`.

### 1.2 Los campos de curso no distinguen `Sin dato` de `No aplica`

Los tres campos de curso son numéricos, y en un numérico `null` significa lo mismo para las 22.649
que nunca entraron y para las 219 matriculadas sin métricas. El filtro ofrece "Sin dato" con
22.868 filas, **y eso es falso**: casi todas son `No aplica`.

No cambies la semántica de `cumple()`. Deriva en el build una columna categórica nueva,
`datos_curso`, a partir de `seleccionado` y de si `pct_avance` es nulo:

| Valor | Regla | Filas esperadas |
|---|---|---:|
| `Con datos` | seleccionada y `pct_avance` no nulo | 1.335 |
| `Sin dato` | seleccionada y `pct_avance` nulo | 219 |
| `No aplica` | no seleccionada | 22.649 |

- Etiqueta en el panel: **"Datos de curso"**
- En los tres filtros numéricos de curso, **esconde la casilla "Sin dato"**: esa pregunta la
  responde ahora `datos_curso`, y bien
- Si los conteos no dan 1.335 / 219 / 22.649 exactos → **bloqueo**, no ajustes la regla para que cuadre

### 1.3 "Otros campos" todavía vuelca columnas crudas

Hoy caen en "Otros campos" con su nombre interno: `anio_grado`, `estrato`, `horas_min`, `horas_max`,
`codigo_embajador`, `metodo_match`, `motivo_no_seleccion`, `aplico_antes_jc`,
`fue_beneficiario_antes`, `pct_avance`, `cursos_inscritos`, `cursos_aprobados`, `duplicado_de`.

Déjalo así en `page.tsx`:

| Campo | Destino |
|---|---|
| `anio_grado` | Grupo **Perfil** |
| `aplico_antes_jc`, `fue_beneficiario_antes` | Grupo nuevo **Antecedentes con JC** |
| `datos_curso`, `pct_avance`, `cursos_inscritos`, `cursos_aprobados` | Grupo nuevo **Programa**, después de Resultado |
| `envio_duplicado` (ver 1.4) | Grupo **Resultado** |
| `estrato` (numérico) | **Esconder**: el filtro es `estrato_cat`, que sí lleva `No aplica` fuera de Colombia |
| `horas_min`, `horas_max` | **Esconder**: `horas_semanales` ya los expone |
| `codigo_embajador`, `metodo_match` | **Esconder**: son de control interno |
| `motivo_no_seleccion` | **Esconder mientras sea 100 % `sin_fuente`** (hoy lo es; se llena con TOC-42). La condición va en el código, no como lista fija: si mañana tiene datos, reaparece solo |
| `duplicado_de` | **Esconder** (lo reemplaza `envio_duplicado`) |

Escondidos significa: añadidos a `CAMPOS_TECNICOS_OCULTOS` y al `HIDDEN` de `Informe.tsx`.
**Unifica esas dos listas en una sola**, exportada desde `lib/`. Hoy son dos y ya divergen.

**Aceptación:** con los datos actuales, la sección "Otros campos" no aparece.

### 1.4 `duplicado_de` — primero verificar, después publicar

El dataset horneado tiene **38** filas con `duplicado_de` no nulo, y apuntan a ids concretos. La
documentación del 2026-09-13 decía **6**. Antes de tocar la interfaz:

```sql
select count(*) filter (where duplicado_de is not null) as con_duplicado,
       count(distinct duplicado_de)                     as filas_apuntadas
from resultado_seleccion;
```

- **Si la base dice 38:** el número creció con el cruce de 2025. Es correcto; corrige el "6" en la
  documentación (Fase 6) y sigue.
- **Si la base dice 6:** el build está inflando el campo. Es un bug de `construir-dataset.mjs`:
  arréglalo y agrega el caso a la prueba 16.
- **Cualquier otro número:** bloqueo.

Luego deriva `envio_duplicado` como categoría **Sí / No** (`Sí` cuando `duplicado_de` no es nulo).
Etiqueta: **"Envío duplicado"**. Los ids nunca se muestran como opciones de filtro.

### 1.5 Encabezados legibles en los dos CSV

Hoy la primera fila de ambos exports es el nombre interno de la columna.

- Export sin PII (`page.tsx`, `exportar`) y export con PII (`app/api/exportar-pii/route.ts`,
  `CAMPOS`): la primera fila usa etiquetas legibles (`ID público`, `Convocatoria`, `País`,
  `Ciudad`, `Fecha de envío`, `Seleccionada`, `Cédula`, `Nombres`, …). **El orden de las columnas
  no cambia**
- Antepón BOM UTF-8 (`\uFEFF`) para que Excel no rompa tildes y eñes
- **No toques** `MAX_FILAS`, la inserción en `export_log` ni la lista de `ids`: son lo que verifica
  TOC-40

### 1.6 Barra de filtros activos (chips)

`§T12 §4` pedía que un filtro puesto siempre se pueda quitar. Hoy funciona por accidente (una
tarjeta activa nunca se esconde), pero un filtro sobre un campo escondido —llegado por URL, por
ejemplo— queda **atrapado**. Y T17 va a poner filtros desde los gráficos, donde hace falta ver
qué quedó puesto.

- Mueve `describirFiltros()` de `Informe.tsx` a `lib/` y reúsala
- Bajo la barra de herramientas: un chip por filtro activo, `Etiqueta: valores ×`; el `×` llama a
  `cambiar(campo, null)`
- Funciona también para campos escondidos
- Sin filtros, la barra no ocupa espacio

### 1.7 Prueba nueva en la suite

Prueba **18** en `test_integridad_convocatoria.py`: `datos_curso` en el dataset horneado da
exactamente 1.335 / 219 / 22.649, y `cursos_inscritos` es de tipo `num`.

**Commit:** `fix(t12): cerrar campos de curso, otros campos, duplicados, CSV y chips`

---

## FASE 2 — T17: los gráficos también filtran

**La especificación completa está en `§T17`. Síguela tal cual**; aquí solo va cómo encaja con la
Fase 1:

- Usa la función única de alternar que pide `§T17 §2`, y que los chips de 1.6 muestren el filtro
  puesto desde el gráfico
- `rangosNumericos()` sale de `FiltroCard.tsx` hacia `lib/` (lo pide `§T17 §3.1`). Los tramos de
  `cursos_inscritos` salen solos ahora que es numérico
- `datos_curso` y `envio_duplicado` son categóricos: su gráfico filtra como cualquier otro
- La lista de campos escondidos de 1.3 aplica también al informe, que sigue siendo **de solo lectura**

**Commit:** `feat(t17): los graficos tambien filtran`

---

## FASE 3 — Revisión de punta a punta en local

Sin commit propio salvo que encuentres algo que corregir. Con `npm run dev` y la sesión de
`soportejunior@tocaunavida.org`, recorre y confirma:

1. Filtrar `Convocatoria = 2026` + `País = CO` desde las **casillas**; luego sumar `Ciudad` desde la
   **dona**: el conteo del encabezado baja, el chip aparece y la URL cambia
2. Recargar la página con esa URL: se reconstruyen los mismos filtros
3. `Seleccionada = No` → el grupo **Programa** desaparece, porque no tiene datos en ese subconjunto
4. `Seleccionada = Sí` → `Datos de curso` muestra 1.335 / 219 (menos, si hay más filtros puestos)
5. Cambiar a modo "al menos una" → aparece el aviso de T17
6. Poner un filtro, abrir **Ver informe** → los gráficos no responden a clics; "Descargar PDF" imprime
7. Exportar sin PII → los encabezados son legibles y las tildes se ven bien en Excel
8. Claro y oscuro; ancho de teléfono (~400 px) sin desplazamiento horizontal
9. Solo teclado: tabular hasta una leyenda de gráfico y alternarla con Enter

**No pruebes el export con PII.** Esa verificación la hace Samuel en persona (TOC-40).

---

## FASE 4 — Vista Distribuciones (TOC-51) — solo con las fases 1 a 3 en verde

Es la comparación **seleccionadas contra no seleccionadas, lado a lado**: la pregunta que motivó
el panel. Si no logras dejarla con la puerta de calidad en verde, **revierte solo esta fase** (por
eso va en su propio commit); la beta sale sin ella.

### Qué construir

- Un botón en la barra: **"Comparar seleccionadas vs. no seleccionadas"**. Abre la vista; al
  cerrarla vuelves al Explorador con los mismos filtros
- Población base: `filtrar(ds, filtros, modo, 'seleccionado')`. Se **ignora el filtro propio de
  `seleccionado`**, y si estaba puesto, un aviso lo dice: *"Esta vista compara ambos grupos; el
  filtro Seleccionada no se aplica aquí"*
- Encabezado: `n` de cada grupo (`1.554 seleccionadas · 22.649 no seleccionadas`, o lo que quede
  con los filtros)
- Por cada campo visible (misma lista y mismos grupos que el Explorador), **dos barras por opción**:
  **% dentro de las seleccionadas** y **% dentro de las no seleccionadas**. Porcentajes, nunca
  conteos, porque los grupos miden 1.554 y 22.649
- Una columna **diferencia en puntos porcentuales**, con un orden opcional "mayor diferencia
  primero" que ordena las **tarjetas** por su mayor diferencia absoluta. Ahí está el valor analítico
- Numéricos: los tramos de `rangosNumericos()`; `Sin dato` y `No aplica` como opciones propias,
  nunca descartadas
- Colores: el semántico de `seleccionado` (verde para Sí, neutro para No), el mismo de T15
- Si un grupo tiene **menos de 30** personas, aviso *"muestra pequeña: los porcentajes pueden
  engañar"*. La vista no se esconde
- Los campos de curso **no se muestran**: son `No aplica` para todo el grupo no seleccionado y la
  comparación no significa nada

### Lo que NO se construye

La **vista Embudo**. Con las fases 2 y 3 sin fuente (TOC-42), un embudo de dos pasos insinúa más
de lo que muestra. Decisión tomada; va escrita en la documentación de la Fase 6.

**Commit:** `feat(t18): vista distribuciones seleccionadas vs no seleccionadas`

---

## FASE 5 — Despliegue y verificación en producción

```bash
git push origin main
```

1. Espera a que termine el despliegue de Vercel (Root Directory `web`)
2. `cd web && npm run verificar-acceso` → `T11 OK: 6/6` **contra producción**
3. Si falla: **no apliques cambios de configuración de Vercel.** Reporta la salida completa como
   bloqueo

---

## FASE 6 — Cierre documental (TOC-50)

Un solo cierre para todo el proyecto, no por partes.

**En `GROU`:**
- `etl/README.md`: la tabla de tubería todavía marca T1, T2, T4, T5 y T7 como `PENDIENTE`. Pásalas a
  `LISTO` y actualiza "15 pruebas" → 18
- `etl/migraciones/README.md`: lista las migraciones 003 a 006, no solo 001 y 002
- `README.md` raíz: el panel tiene Explorador + Distribuciones (si la Fase 4 quedó), el informe
  imprimible y los gráficos que filtran. El Embudo **no se construyó**, y por qué
- `HANDOFF-CODEX.md`: al final, una sección **"Cierre — 2026-09-XX"** con lo hecho, los números
  finales de la suite y los bloqueos

**En `admin-usable`** (`C:\Users\EstudiantesJC\downloads\admin-usable`):

> ⚠ Ese repo tiene muchos cambios sin commitear que **no son tuyos**. Haz `git add` **solo** de los
> archivos que tocas aquí, uno por uno. Nunca `git add -A` ni `git add .`.

- `docs/procesos/panel-convocatoria-jc.md`: sección **§14 Cierre del proyecto**. Qué quedó en
  producción, los números finales, el gotcha del sufijo `.0` en `cedula_norm` (la carga de T4 quedó
  vieja una vez: si se regenera `payload.json`, recargar T4 **antes** de confiar en T5), el cambio
  de 6 a N duplicados de 1.4 y el Embudo descartado
- `docs/procesos/mapa-codigo.md`: la sección "Panel de Convocatoria JC (`GROU/etl/`)" ya existe.
  Agrégale `web/scripts/construir-dataset.mjs` y `web/scripts/verificar-acceso.mjs`
- `docs/convenciones.md`: tres patrones reutilizables, si no están ya.
  (1) **Dataset columnar horneado en el build**: diccionario + índices, filtrado en memoria.
  (2) **"Mirar el dato, no la lista"**: `esBooleanoDeVerdad()` y el bug de los cuatro filtros en "Sí".
  (3) **Conteo de faceta omitiendo el propio campo**, para filtros en cascada
- `docs/00-vision-global.md`: el proceso pasa a **completado (beta entregable)**
- `claude_sessions.md`: entrada al final, 5 a 10 líneas, con el formato del archivo

**Commits:** `docs: cierre del proyecto GROU` en cada repo. Push del de `GROU`. **No hagas push de
`admin-usable`**: está en una rama de trabajo de Samuel.

---

## Lo que NO haces tú — queda para Samuel

| Qué | Issue | Por qué no es tuyo |
|---|---|---|
| Probar a mano un export con PII (ids, nombres, `export_log`, límite de 5.000) | TOC-40 | Manipula datos personales reales |
| Agregar los correos de Nati y Nata a `CORREOS_PERMITIDOS` | TOC-45 | Samuel todavía no nos dio las direcciones |
| Primer inicio de sesión de cada una y **después** `disable_signup` | TOC-45 | Antes de ese primer inicio, bloquearía la creación de sus cuentas |
| Abrir el panel desde un teléfono fuera de la red | TOC-41 | Revisión humana |
| Actualizar el estado de las issues en Linear | todas | Lo hace Claude con tu reporte |
| Conseguir los exports de PsicoSmart, SendGrid, Zapsign… | TOC-42 | Fuentes externas |
| Cambiar los formularios a lista desplegable de ciudad | TOC-43 | Equipo de convocatoria |

---

## Definición de terminado

- [ ] Fase 1: `datos_curso` 1.335 / 219 / 22.649; `cursos_inscritos` numérico; "Otros campos"
  vacío; duplicados verificados contra la base; CSV legibles con BOM; chips funcionando
- [ ] Fase 2: aceptación completa de `§T17`
- [ ] Fase 3: los 9 recorridos confirmados
- [ ] Fase 4: Distribuciones en verde, o revertida y anotada como bloqueo
- [ ] Fase 5: producción desplegada, `T11 OK: 6/6`
- [ ] Fase 6: documentación de ambos repos cerrada
- [ ] Suite: `T7 OK: fallas=0` con 18 pruebas · `npm run build` limpio

## Formato de tu reporte final

```
## Fases
F1 ✅/❌ <commit> — una línea
F2 …
## Números finales
suite: N/N · seleccionadas 2025/2026 · datos_curso con/sin/no_aplica · duplicados base/dataset
## Desviaciones del plan
<qué hiciste distinto y por qué — o "ninguna">
## Bloqueos
<tarea · qué encontraste · qué hace falta para desbloquear — o "ninguno">
```
