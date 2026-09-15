# Plan T21 — Contrastar poblaciones (reemplaza "Comparar seleccionadas vs. no seleccionadas")

**Para:** Codex · **Redactado:** 2026-09-15 por Claude (arquitectura y QA) · **Issue:** TOC-58 (T21) en Linear

## Por qué

Samuel usó la vista actual de Distribuciones (TOC-51) y **no se ve un patrón claro**. Lo
reproduje sobre el dataset real y el problema no es de cálculo sino de diseño:

1. Los primeros puestos son **tautológicos**: `retirado`, `estado_final` y `fase_max_alcanzada`
   dan ±100 pp porque solo existen para seleccionadas.
2. **`sin_dato` parece patrón:** condición laboral `sin_dato` +16 pp. Refleja qué versión del
   formulario llenó cada persona.
3. **Mezcla países y años:** Uruguay es el 11,3 % de las seleccionadas y el 1,7 % de las no
   seleccionadas (cupos, no perfil).
4. La partición es fija (seleccionadas/no seleccionadas): no deja preguntar "Bogotá vs.
   Medellín" o "2025 vs. 2026".
5. Muestra códigos internos (`no_habla`, `sin_dato`).

**Decisión de Samuel:** quitar esa vista por completo y reemplazarla por un contraste entre **dos
poblaciones que define la usuaria**, ocultando las opciones por debajo del 10 %.

## Reglas

- **Empieza solo cuando T20 (TOC-57) esté commiteado y subido.** Las dos tocan `app/page.tsx`. Si
  T20 no está en `origin/main` → bloqueo, no mezcles.
- Puerta de calidad antes de cada commit: T7 en verde, `npm run build`, T11 6/6. Un commit por fase
  y push solo al final.
- Sin migraciones SQL; todo ocurre en el cliente, sobre el dataset horneado.
- No toques `lib/dataset.ts` (contrato), `app/api/**`, `lib/auth*.ts` ni `construir-dataset.mjs`.
- Si algo no cuadra con los números de aceptación → bloqueo, no ajustes la regla para que cuadre.

---

## El flujo, tal como lo pidió Samuel

```
Explorador (Población A = los filtros de siempre)
   │
   ├─ clic en [Comparar] ──► modo "definiendo Población B"
   │                           · el mismo tablero de filtros ahora edita B
   │                           · banner fijo: "Estás definiendo la Población B · N personas"
   │                           · [Listo]  [Vaciar B]  [Descartar comparación]
   │
   └─ ya existe una Población B ──► aparece [Contrastar población] junto a [Ver informe]
                                      │
                                      └─► vista de contraste A vs. B (reemplaza el tablero)
                                          · [Volver al Explorador]
```

---

## FASE 1 — Estado de dos poblaciones y URL

### `lib/camposPanel.ts`

- Exportar `GRUPOS_PANEL` (nombre, campos, color) y **usarlo en `page.tsx`**. Hoy la lista está
  duplicada en `page.tsx` y `Distribuciones.tsx`: queda una sola.
- Exportar `etiquetaValor(v: string)`:
  - `sin_dato` → `Sin dato` · `no_aplica` → `No aplica`
  - si el valor tiene `_` y ningún espacio: cambiar `_` por espacio y poner mayúscula inicial
    (`no_habla` → `No habla`)
  - cualquier otro valor se deja igual (`Entre 10 y 15 horas.`, nombres de ciudad)

### `lib/urlFiltros.ts`

- `parseUrl(ds, prefijo = '')` y `encodeFilters(filtros, prefijo)`. La Población A va como hoy (sin
  prefijo); la B con prefijo `b.` (`b.pais=cat:0`) y `b.modo`.
- `vista=contraste` si la vista de contraste está abierta.
- Los enlaces viejos siguen funcionando: sin claves `b.*` no hay Población B.

### Estado en `Explorador` (`app/page.tsx`)

| Estado | Tipo | Nota |
|---|---|---|
| `filtros`, `modo` | existentes | Población A |
| `filtrosB` | `Filtros \| null` | `null` = no se ha pulsado Comparar |
| `modoB` | `Modo` | |
| `editando` | `'A' \| 'B'` | qué población edita el tablero |
| `contraste` | `boolean` | vista de contraste abierta |

- **[Comparar]** reemplaza al botón "Comparar seleccionadas vs. no seleccionadas" en la barra.
  - Si `filtrosB` es `null`: `filtrosB = copia de filtros`, `modoB = modo` y `editando = 'B'`.
    **Arranca como copia de A** a propósito: para contrastar bien casi siempre se cambia **una**
    cosa (p. ej. `Seleccionada: Sí` → `No`) y se deja igual el resto.
  - Si ya existe: solo `editando = 'B'`.
- Mientras `editando === 'B'`:
  - `FiltroCard`, chips, selector de modo y botón "Limpiar filtros" leen y escriben **B**. Es el
    mismo tablero con otra fuente: no dupliques componentes.
  - Banner fijo arriba del tablero con color de B:
    `Estás definiendo la Población B · 10.758 personas`, más `[Listo]` (→ `editando = 'A'`),
    `[Vaciar B]` (→ `filtrosB = {}`) y `[Descartar comparación]` (→ `filtrosB = null`, cierra el
    contraste).
  - **Exportaciones (CSV sin PII y con datos personales) y "Ver informe" deshabilitados**, con
    texto *"Vuelve a la Población A para exportar"*. Las exportaciones siempre son de A: con datos
    personales no puede haber duda de qué población se baja.
- `Encabezado`: si hay B, mostrar `Población A: N · Población B: M` bajo el título.

**Commit:** `feat(t21): estado de dos poblaciones y url`

---

## FASE 2 — Botón "Contrastar población" y vista de contraste

### Botón

En `.report-trigger`, **al lado** de "Ver informe", visible solo si `filtrosB !== null`:
**[Contrastar población]**. Deshabilitado, con motivo visible, si:
- A o B tiene 0 personas → *"Una de las poblaciones está vacía"*
- A y B contienen exactamente las mismas filas → *"Las dos poblaciones son iguales"*

Al abrir: `contraste = true`, `editando = 'A'`, y la vista reemplaza el tablero de filtros (igual
que lo hacía Distribuciones).

### Lógica pura en `lib/contraste.ts` (sin React, para poder probarla)

```ts
export const UMBRAL_RUIDO_PCT = 10;

export type OpcionContraste = {
  etiqueta: string;
  pctA: number; pctB: number;
  diff: number;            // pctB - pctA, en puntos porcentuales
  esSinDato: boolean;      // Sin dato / No aplica
};
export type TarjetaContraste = {
  campo: string;
  opciones: OpcionContraste[];   // solo las visibles
  ocultas: number;               // opciones bajo el umbral en ambas
  puntaje: number;               // max |diff| entre visibles que NO son sin dato
  defineLaPoblacion: boolean;    // el campo está en filtrosA o filtrosB
  multivalor: boolean;
};
export function contrastar(ds, filtrosA, modoA, filtrosB, modoB): {
  nA: number; nB: number; enAmbas: number; tarjetas: TarjetaContraste[];
};
```

Reglas:

1. `idxA = filtrar(ds, filtrosA, modoA)` e `idxB = filtrar(ds, filtrosB, modoB)`. **No hay
   `omitir`**: cada población es exactamente su filtro.
2. `enAmbas` = filas presentes en las dos (marcar con un `Uint8Array` de `ds.total`).
3. Campos: los de `GRUPOS_PANEL` en su orden, menos `camposOcultos(ds)`.
4. Opciones por tipo:
   - `cat`/`multi`: `ds.campos[c].valores`
   - `bool`: `No`/`Sí`
   - `num`: tramos de `rangosNumericos(ds, campo)` + `Sin dato`
5. `pctA = conteo en A / nA * 100`, igual para B. En `multi` una persona cuenta en varias
   opciones.
6. **Regla de ruido (la de Samuel):** una opción se **oculta** si `pctA < 10` **y** `pctB < 10`.
   Si pasa el 10 % en cualquiera de las dos, se muestra; así se ve una opción que es grande solo en
   una población, que es justo el hallazgo. `ocultas` cuenta las que se quitaron.
7. Una tarjeta sin opciones visibles **no se muestra**.
8. `esSinDato` = etiqueta cruda `sin_dato`, `no_aplica`, `Sin dato` o `No aplica`. **Se muestran si
   pasan el umbral, pero nunca cuentan para `puntaje`.**
9. `defineLaPoblacion` = el campo aparece en `filtrosA` o `filtrosB`. Su diferencia es esperada
   (la usuaria la puso), así que no entra al ranking.
10. Recorrer las filas **una vez por campo** con arreglos tipados. Presupuesto: < 300 ms para A y B
    del tamaño del universo. Memoizar por `(filtrosA, modoA, filtrosB, modoB)`.

### Componente `components/ContrastePoblaciones.tsx`

- **Encabezado, dos columnas:**
  - `Población A` / `Población B`: `describirFiltros(...)` (o *"Todas las postulaciones"* si no
    hay filtros), `N personas` y `% del universo (24.203)`.
  - Línea de solapamiento: *"X personas están en ambas poblaciones (Y % de A)"*.
  - Avisos: *"Muestra pequeña: los porcentajes pueden engañar"* si `nA < 30` o `nB < 30`, y
    *"Las poblaciones se solapan más del 50 %: las diferencias se diluyen"* si
    `enAmbas / min(nA, nB) > 0,5`.
  - Nota fija: *"Se ocultan las opciones por debajo del 10 % en ambas poblaciones."*
- **Controles:** `[Mayor diferencia primero]` (predeterminado) / `[Orden del panel]` y
  `[Volver al Explorador]`.
- **Tarjeta por campo:** título con `LABELS`; por opción, `etiquetaValor(etiqueta)`, dos barras
  rotuladas **A** y **B** con su %, y la diferencia `+12,4 pp` (B − A) con signo y color.
  - Las opciones `esSinDato` van con estilo atenuado y la leyenda *"no cuenta para el orden"*.
  - Pie: *"N opciones ocultas (< 10 %)"* si `ocultas > 0`.
  - En `multivalor`: *"Una persona puede estar en varias opciones; los % no suman 100."*
- **Orden:** tarjetas con `defineLaPoblacion = false` por `puntaje` descendente. Al final, un
  `<details>` cerrado: *"Campos usados para definir las poblaciones (diferencia esperada)"* con
  esas tarjetas.
- **Colores:** A = `var(--chart-selected)`. B = token nuevo `--pob-b` (`#C2410C` en claro,
  `#FDBA74` en oscuro; en `:root` y en el bloque oscuro). **Nunca solo color:** siempre el rótulo
  A/B junto a cada barra. Nada de azul de marca en las barras.
- Accesible con teclado; ~400 px sin desplazamiento horizontal (las barras se apilan).

**Commit:** `feat(t21): contrastar poblaciones`

---

## FASE 3 — Quitar la comparación vieja por completo

- Borrar `components/Distribuciones.tsx`.
- Quitar de `page.tsx` el estado `distribuciones`, su botón y su render.
- Borrar del CSS todas las reglas `.distribution*` y `.distributions` (también su mención en
  `@media print`).
- `grep -rn "Distribuciones\|distribution" web --include=*.ts --include=*.tsx --include=*.css`
  (fuera de `node_modules`/`.next`) → **vacío**.

**Commit:** `refactor(t21): quitar vista distribuciones`

---

## FASE 4 — Pruebas de la lógica

`web/scripts/probar-contraste.ts`, corrido con `npx tsx` (agrega `tsx` como devDependency y el
script `"probar-contraste"` en `package.json`). Sobre el **dataset real horneado**
(`data/postulaciones.json`, sin PII). Solo imprime números.

**Caso 1 — seleccionadas vs. no seleccionadas en 2026 Colombia.** A = `convocatoria=2026`,
`pais=CO`, `seleccionado=Sí`; B = igual con `seleccionado=No`. Esperado (calculado por Claude
sobre el mismo dataset):

| Comprobación | Esperado |
|---|---|
| nA / nB / enAmbas | 598 / 10.758 / 0 |
| `acceso_computador` = `ninguno` | A 0,5 % · B 22,8 % · diff +22,3 pp · **visible** |
| `horas_semanales` = `Menos de 5 horas.` | A 0,7 % · B 18,7 % · **visible** |
| `como_se_entero` = `whatsapp` | A 23,2 % · B 40,2 % · **visible** |
| `seleccionado` | `defineLaPoblacion = true` |

Tolerancia ±0,1 pp por redondeo.

**Caso 2 — sintético (dataset mínimo armado en el test):**
- opción con A 3 % y B 8 % → oculta
- A 3 % y B 12 % → visible
- A 9,99 % y B 9,99 % → oculta
- una opción `sin_dato` con +40 pp no cambia el `puntaje`
- tarjeta con todo bajo 10 % → no aparece
- A y B idénticas → la función de "iguales" devuelve verdadero

**Caso 3 — URL:** `encodeFilters` → `parseUrl` con prefijo `b.` devuelve los mismos filtros; una
URL sin `b.*` da `filtrosB = null`.

**Commit:** `test(t21): pruebas de contraste`

---

## FASE 5 — Recorrido local, despliegue y documentación

Con `npm run dev` y la sesión de `soportejunior@tocaunavida.org` (si no puedes iniciar sesión,
anótalo como bloqueo y sigue):

1. Filtrar `Convocatoria 2026` + `País CO` → **Comparar** → banner de B; B arranca con los
   mismos filtros
2. En B marcar `Seleccionada: No`; en A (tras **Listo**) `Seleccionada: Sí`
3. Aparece **Contrastar población** junto a **Ver informe** → la vista muestra 598 / 10.758 y
   `Acceso a computador · Ninguno` entre las primeras tarjetas
4. Recargar la página → mismos A, B y vista
5. Mientras se edita B, exportar y Ver informe están deshabilitados
6. **Descartar comparación** → vuelve el Explorador sin B y el botón desaparece
7. Claro/oscuro y ~400 px

Luego `git push origin main` y `npm run verificar-acceso` contra producción: **6/6**.

**Docs:**
- En `GROU`: `README.md` (Explorador + Contrastar poblaciones; Distribuciones ya no existe) y
  una sección *"Cierre T21"* en `HANDOFF-CODEX.md`.
- En `admin-usable` (`git add` archivo por archivo, sin push): `docs/procesos/panel-convocatoria-jc.md`
  §17 con qué quedó, y una entrada en `claude_sessions.md`.

**Commit:** `docs: cierre T21 contraste de poblaciones`

---

## Definición de terminado

- [ ] Comparar → definir B → Contrastar población, con A/B en la URL
- [ ] Exportar e informe siempre de A y deshabilitados mientras se edita B
- [ ] Opciones < 10 % en ambas ocultas; Sin dato no ordena; campos que definen al final
- [ ] Etiquetas legibles; solapamiento y muestra pequeña avisados
- [ ] Distribuciones borrada sin rastro
- [ ] `probar-contraste` en verde con los números del caso 1
- [ ] Build limpio, T7 en verde, T11 6/6 en producción

## Formato del reporte final

```
## Fases
F1 ✅/❌ <commit> — una línea
…
## Números (caso 1)
nA · nB · enAmbas · computador ninguno A/B/diff · horas <5 A/B · whatsapp A/B
## Desviaciones del plan
## Bloqueos
```
