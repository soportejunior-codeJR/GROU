# Plan T22 — Gráficas del informe que filtran con un clic

**Para:** Codex · **Redactado:** 2026-09-16 por Claude (arquitectura y QA) · **Issue:** TOC-68 (T22) en Linear
**Pedido de Samuel:** "que en las estadísticas del informe también se pueda oprimir el filtro con base
en la gráfica, como ya venimos manejando" (igual que en las tarjetas del Explorador).

Reglas de siempre (§0 de `PLAN-CIERRE-CODEX.md`): fases continuas, puerta de calidad antes de cada
commit, un commit por fase, push solo al final, bloqueos anotados y no adivinados, **sin migraciones
SQL**.

```bash
cd etl && python test_integridad_convocatoria.py      # T7 en verde (fallas=0)
cd web && npm run build                               # prebuild hornea el dataset real
cd web && npm run verificar-acceso                    # T11 6/6
```

**No toques:** `lib/dataset.ts`, `lib/filtros.ts`, `lib/urlFiltros.ts`, `app/api/**`, `lib/auth*.ts`,
`construir-dataset.mjs`. Este plan no cambia datos, conteos, contrato de filtros ni URL: solo conecta
el informe al mismo `cambiar` que ya usa el Explorador.

---

## Diagnóstico (ya verificado, no lo re-investigues)

1. **El informe ya recibe `cambiar`, pero no se lo pasa a las gráficas.** `app/page.tsx:404-411`
   entrega `cambiar={cambiar}` a `<Informe>`, y `components/Informe.tsx` lo declara con el comentario
   "En pantalla los gráficos del informe filtran igual que los del Explorador". Sin embargo, en
   `Informe.tsx:70` se renderiza `<GraficoFaceta ds={ds} campo={campo} filtros={filtros} modo={modo} />`
   **sin `cambiar`**. Por eso:
   - los botones de la dona salen `disabled` (`GraficoFaceta.tsx`, `disabled={!cambiar}`);
   - las barras y los segmentos llaman a `cambiar?.(…)`, que no hace nada;
   - los histogramas salen deshabilitados;
   - no aparece la nota "toca o haz clic para filtrar".
2. `GraficoFaceta` ya trae todo lo necesario (dona, barras, histograma, `alternarFiltro`, estilos de
   seleccionado/atenuado, `no-print` en las notas). **No hay que reescribir las gráficas.**
3. **Bug latente que aparece al activar los clics:** la lista de campos del informe
   (`Informe.tsx:27-38`) decide si un campo **numérico** se muestra mirando `indices`, que ya incluye
   el filtro del propio campo. Si alguien toca **"Sin dato"** en un histograma del informe, todas las
   filas que quedan tienen ese campo vacío, el `some(... != null)` da falso y **la gráfica desaparece
   en el mismo clic que la activó**, sin forma de quitar el filtro desde ahí. Los campos categóricos
   no tienen el problema, porque `contarFacetas` ya excluye el filtro del propio campo.
4. La barra "Otras" (más de 20 valores) no es clicable. Es igual en el Explorador y se deja así.

---

## FASE 1 — Conectar los clics (commit `feat(t22): graficas del informe filtran con clic`)

`components/Informe.tsx`:

- Pasar `cambiar` a cada gráfica:
  `<GraficoFaceta ds={ds} campo={campo} filtros={filtros} modo={modo} cambiar={cambiar} />`.
- Corregir el punto 3: para `def.tipo === 'num'`, evaluar sobre la base **sin el filtro propio**:
  `filtrar(ds, filtros, modo, campo)`. Además, **un campo con filtro activo siempre se muestra**
  (`if (filtros[campo]) return true;` antes de cualquier otra condición), para que nunca desaparezca la
  gráfica que tiene el filtro puesto.
- Ojo con el costo: hoy el `useMemo` recorre `indices` una vez por campo numérico. Con
  `filtrar(..., campo)` es un recorrido completo por campo numérico en cada clic. Mide con el dataset
  real (unas 24 mil filas): si el clic tarda más de ~150 ms en un portátil normal, calcula la base una
  sola vez por campo numérico dentro del mismo `useMemo` y no en cada render.

Aceptación de la fase:

- En el informe, clic en una porción de dona, en una etiqueta, en una barra o en un rango del
  histograma: el filtro se activa, el chip aparece arriba, el texto `report-context` del encabezado del
  informe cambia y la tarjeta equivalente del Explorador muestra la misma selección.
- Un segundo clic sobre lo mismo quita el filtro (`alternarFiltro`).
- Con modo `AL_MENOS_UNA` aparece la nota "cada toque suma personas".
- Histograma → "Sin dato": la gráfica **sigue visible** y se puede desmarcar desde ahí.

## FASE 2 — Quitar el filtro desde la tarjeta (commit `feat(t22): limpiar filtro en tarjeta del informe`)

El informe queda lejos de los chips de arriba; hay que poder deshacer sin hacer scroll.

- En cada `article.report-chart` con `filtros[campo]` activo, agregar junto al `h3` un botón
  `type="button" className="clear no-print"` con el texto **"Quitar filtro"** que llame
  `cambiar(campo, null)`. Es el mismo patrón que `FiltroCard.tsx:154`.
- Marcar la tarjeta con filtro activo con una clase `report-chart-activa` (borde
  `var(--chart-selected)` de 2 px). En `@media print` esa clase vuelve al borde normal
  (`border-color: #bbb`), porque el PDF no debe verse distinto por esto.
- Encima de `report-grid`, solo en pantalla (`no-print`), una línea discreta:
  "Toca una gráfica para filtrar; el informe y el Explorador se actualizan juntos."

## FASE 3 — Verificación manual y cierre (commit `docs: cierre T22 informe interactivo`)

Probar en `npm run dev` con el dataset real, en claro, oscuro, ~400 px y 125 % de zoom:

1. **Ver informe** → clic en Convocatoria 2026 (dona) → clic en Seleccionada = Sí. El encabezado del
   informe dice ambos filtros, el conteo coincide con el de la barra superior y la URL trae los dos
   parámetros.
2. Recargar la página con esa URL → **Ver informe**: las mismas porciones aparecen seleccionadas.
3. Histograma de un campo numérico: clic en un rango, luego en "Sin dato", luego "Quitar filtro".
4. Campo `multi` con barras: clic en dos opciones en modo `TODAS` y en modo `AL_MENOS_UNA`.
5. En móvil (~400 px), tocar sin zoom accidental (`touch-action: manipulation` ya existe).
6. **Descargar PDF** con filtros activos: no aparecen "Quitar filtro", la nota de clic ni el borde de
   tarjeta activa; el resto del PDF sigue igual que hoy.
7. Teclado: Tab llega a las etiquetas de la dona, las etiquetas de las barras y las columnas del
   histograma (los segmentos SVG y el relleno de las barras son solo para ratón, como en el
   Explorador); Enter o Espacio filtra; el foco se ve.

Luego actualizar `README.md` (sección del informe) y `HANDOFF-CODEX.md` con una línea de T22, puerta
de calidad en verde y push.

---

## Coordinación con T21 (TOC-58, pendiente)

T21 también toca `app/page.tsx` y define que "exportaciones e informe siempre de A". T22 solo toca
`components/Informe.tsx` y `app/globals.css`, así que **puede ir antes**. Cuando se ejecute T21, el
`cambiar` que recibe `<Informe>` debe seguir siendo el de la **población A**, nunca el de B. Deja esa
nota en el plan de T21 al cerrar este.

## Si algo no cuadra

- Si el clic en el informe hace que el Explorador se desplace o pierda el scroll: anótalo y no lo
  arregles con `scrollTo` sin avisar; Samuel decide.
- Si la Fase 1 supera el umbral de rendimiento aun con memo: detente y reporta los tiempos medidos.
