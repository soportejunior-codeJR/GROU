# Plan de finalización — GROU / Panel de Convocatoria JC (T19: acabado final)

**Para:** Codex · **Redactado:** 2026-09-15 por Claude (arquitectura y QA) · **Entrega beta:** 2026-09-17
**Issue:** TOC-56 (T19) en Linear (proyecto *GROU — Panel de Convocatoria JC*)

Samuel probó la beta y **los datos están bien**. Este plan es solo acabado visual y una gráfica
nueva. `PLAN-CIERRE-CODEX.md` ya se ejecutó (fases 1–6); **no lo rehagas**. Las reglas de §0 de
ese plan siguen vigentes: fases continuas, puerta de calidad en cada fase, un commit por fase,
push solo al final, bloqueos anotados y no adivinados, **sin migraciones SQL**.

Puerta de calidad (las tres en verde antes de cada commit):

```bash
cd etl && python test_integridad_convocatoria.py      # T7 OK: fallas=0 (18 pruebas)
cd web && npm run build                               # prebuild hornea el dataset real
cd web && npm run verificar-acceso                    # T11 OK: 6/6
```

**No toques:** `construir-dataset.mjs` (salvo lo que diga una fase), `lib/dataset.ts` (contrato),
`app/api/exportar-pii/route.ts`, `lib/auth*.ts`, `urlFiltros.ts`. Nada de este plan cambia datos,
conteos, filtros ni la URL.

---

## FASE 0 — Dejar el repo limpio

Estado real al 2026-09-15:

- `main` va **1 commit por delante** de `origin/main` (`4ef129a feat(visual): fondo en azul intenso`).
  Ese fondo lo reemplaza la Fase 3; no hace falta revertirlo, se sobrescribe.
- `web/components/FiltroCard.tsx` tiene un cambio **solo de formato** (prettier une un `onChange`
  en una línea). Commitéalo solo: `style: formato de FiltroCard`.

---

## FASE 1 — Tipografía legible (quitar lo que se ve borroso)

### Por qué se ve borroso (diagnóstico, no lo re-investigues)

1. **`backdrop-filter: blur()` bajo el texto** en 6 reglas de `app/globals.css`: `.shell`,
   `.topline`, `.filter-card, .report-chart`, `.distribution-card`, `.login-content`. Todo el
   contenido vive dentro de `.shell`, así que Chrome compone el panel entero como capa
   desenfocada encima de un fondo **animado** (`BackgroundPaths`): el texto se re-rasteriza en
   cada cuadro y en Windows con escalado 125 % pierde el antialiasing subpíxel.
2. **Giro 3D de las tarjetas:** `.filter-card { perspective }` + `.filter-card-chart { rotateY(180deg) }`
   + `.filter-card-chart > * { rotateY(180deg) }`. Doble rotación = el texto se dibuja como textura 3D.
3. **Superficies semitransparentes** (`color-mix(... 72–75%, transparent)`): el texto queda sobre
   un fondo que cambia.
4. **Century Gothic** no está garantizada en los equipos; el fallback (`AppleGothic`, `system-ui`)
   varía y es de trazo fino. Además hay textos de **8 px** (`.histogram-bin small`) y 11 px.
5. `.eyebrow` en monoespaciada, mayúsculas y 11 px.

### Qué hacer

- **Fuente: Inter**, autoalojada desde npm: `npm i @fontsource-variable/inter` e
  `import '@fontsource-variable/inter';` en `app/layout.tsx`.
  **No uses `next/font/google`:** descarga la fuente en el build y la red corporativa (SSL
  interceptado) lo rompe en local. Inter tiene cifras tabulares reales, que el panel necesita.
  ```css
  --fuente-sans: 'Inter Variable', 'Segoe UI', system-ui, sans-serif;
  ```
  `body`: `font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;` y mantener `font-variant-numeric: tabular-nums`.
  Pesos: 400 texto, 600 títulos y leyendas, 700 solo cifras destacadas.
- **Eliminar todos los `backdrop-filter`** (las 6 reglas; también sus `none !important` en
  `@media print`, que quedan sobrando).
- **Superficies opacas:** `.shell`, `.topline`, `.filter-card`, `.report-chart`,
  `.distribution-card` usan `background: var(--surface)` sólido. La sombra puede quedarse.
- **Quitar el giro 3D:** fuera `perspective`, `transition: transform` y los dos `rotateY`. El cambio
  tarjeta ↔ gráfico es un intercambio de contenido con `opacity` en 150 ms (y sin animación con
  `prefers-reduced-motion`, que ya está cubierto).
- **Tamaños mínimos:** ningún texto HTML por debajo de **12 px**. `.histogram-bin small` 8→11 px
  (10→12 en `pointer: coarse`), `.chart-labels`, `.bar-row`, `.distribution-option`,
  `.chart-note` 11→12 px, `.check` y `.filter-chip` 13 px. En los SVG (`.donut-total`,
  `.donut-caption`) están en unidades del viewBox: no los toques salvo que se vean menores a 12 px
  en pantalla.
- **`.eyebrow`:** misma sans, 12 px, peso 600, `letter-spacing: .06em`.
- **`h1`:** 30 px, peso 700, `letter-spacing: -.02em` (no `-.03em`).

**Aceptación:** captura antes/después a 100 % y 125 % de zoom en Chrome/Windows; el texto de
tarjetas, chips y tabla se ve nítido. `grep -n "backdrop-filter\|rotateY\|perspective" app/globals.css`
no devuelve nada.

**Commit:** `feat(t19): tipografia legible sin desenfoque`

---

## FASE 2 — Fecha de envío como gráfica de onda, con botones y rango

### El dato real (verificado sobre `web/data/postulaciones.json`)

- `fecha_envio` se hornea como `cat` con **131 valores** `YYYY-MM-DD`, sin `Sin dato`. Hoy se
  muestra como **131 casillas**.
- Dos ventanas separadas por ~9 meses sin postulaciones:

| Convocatoria | Desde | Hasta | Días con envíos | Filas | Pico |
|---|---|---|---:|---:|---|
| 2025 | 2024-11-12 | 2025-02-17 | 54 | 10.631 | 2025-01-30 · 1.073 |
| 2026 | 2025-11-24 | 2026-02-16 | 77 | 13.572 | 2026-01-27 · 3.605 |

  Por mes: 2025 → nov 84 · dic 8 · ene 5.639 · feb 4.900 | 2026 → nov 16 · dic 297 · ene 8.626 · feb 4.633.

### Regla de oro: el filtro NO cambia de forma

El filtro sigue siendo `{ tipo: 'cat', valores: number[] }` con los **índices de las fechas**
elegidas. Botones, rango y arrastre solo calculan qué índices entran. Así no cambian el contrato,
la URL, los chips, el CSV, el informe ni la cascada. Los conteos salen de
`contarFacetas(ds, 'fecha_envio', filtros, modo)`, que ya omite el propio campo.

### Componente nuevo `components/GraficoFechaEnvio.tsx`

Se usa **en lugar** de las casillas y del gráfico genérico cuando `campo === 'fecha_envio'`:
en `FiltroCard.tsx` (ambas caras) y en `Informe.tsx` (sin `cambiar` → solo lectura). La tarjeta
de `fecha_envio` ocupa **todo el ancho** de la grilla (`grid-column: 1 / -1`).

1. **Una onda por convocatoria, lado a lado** (apiladas bajo 700 px), con **la misma escala Y**.
   Nunca un eje de calendario continuo: el hueco de 9 meses aplastaría ambas ondas. Cada panel se
   titula `Convocatoria 2025 · 12 nov 2024 – 17 feb 2025`.
2. **Rellenar los días sin envíos con 0** dentro de cada ventana. Los 131 valores solo traen días
   con al menos una fila; sin relleno la curva une puntos lejanos y miente.
3. **Curva:** SVG a mano (como el resto de gráficos; `recharts` está en `package.json` pero no se
   usa y no hay que traerlo ahora). Trazado **monótono** (Fritsch–Carlson): Catmull-Rom se
   sale por debajo de 0 entre un día en 0 y un pico. Área con relleno + línea de 2 px.
   - Días dentro del filtro: `var(--chart-selected)`; fuera: `var(--semantic-neutral)` al 35 %.
     Sin filtro, todo en `--chart-selected`.
   - Marca el pico de cada panel con un punto y la etiqueta `27 ene · 3.605`.
4. **Granularidad:** botones `Día` / `Semana` (semana que empieza en lunes). Solo cambia el dibujo;
   el filtro sigue siendo por día.
5. **Botones de atajo** (generados desde los datos, no escritos a mano):
   `Todo` · `Convocatoria 2025` · `Convocatoria 2026` · uno por mes con envíos
   (`nov 2024`, `dic 2024`, `ene 2025`, `feb 2025`, `nov 2025`, …). Un clic reemplaza la selección
   de fecha; `Todo` quita el filtro (`cambiar('fecha_envio', null)`). El botón activo queda
   marcado (`aria-pressed`). **Ojo:** `Convocatoria 2025` solo toca `fecha_envio`, no el filtro
   `convocatoria`.
6. **Rango:** dos `<input type="date">` **Desde / Hasta** con `min`/`max` = límites de los datos,
   más **arrastre sobre la onda** (pointer events: ratón y dedo) que llena ambos campos. Con teclado:
   las flechas mueven el extremo enfocado un día. Si el rango no contiene ninguna fecha con envíos,
   mostrar *"Sin postulaciones en ese rango"* y **no aplicar** el filtro.
7. **Tooltip** al pasar o tocar: `27 ene 2026 · 3.605 postulaciones · 26,6 % del subconjunto`
   (porcentaje con el mismo denominador que usa `GraficoFaceta`).
8. **Accesible:** `role="img"` con `aria-label` que resume ambas ondas, y un `<details>`
   *"Ver datos por día"* con la tabla fecha → conteo.
9. **Fechas sin zona horaria:** parte `'YYYY-MM-DD'` a mano. **Nunca `new Date('2026-01-27')`**:
   lo interpreta como UTC y en Colombia (UTC−5) se muestra el día anterior. Formato con
   `Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', … })` sobre `Date.UTC(y, m-1, d)`.

### Encajes con lo existente

- **`describirFiltros()`** (chips e informe): para `fecha_envio`, comprimir días consecutivos en
  tramos: `Fecha de envío: 26 ene 2026 – 28 ene 2026 (3 días)`. Hoy listaría hasta 131 fechas.
- **`Distribuciones.tsx`:** `fecha_envio` se compara **por mes** (8 opciones), no por día. Derivar
  el mes en el componente, no en el build.
- **Informe impreso:** la onda se imprime (`print-color-adjust: exact`), sin botones ni rango.

### Aceptación (con cero filtros más)

- `Todo` → 24.203 · `Convocatoria 2025` → 10.631 · `Convocatoria 2026` → 13.572 ·
  `ene 2026` → 8.626 · rango `2026-01-27`–`2026-01-27` → 3.605
- Poner `País = CO` → las ondas bajan y los botones siguen visibles (la faceta omite su campo)
- Recargar con la URL → mismo filtro de fecha reconstruido
- Si cualquiera de esos números no cuadra → **bloqueo**

**Commit:** `feat(t19): fecha de envio en onda con botones y rango`

---

## FASE 3 — Fondo con la paleta ROFÉ y logo

### Paleta oficial (Manual de identidad ROFÉ 2025, no inventar otras)

`#EEC935` amarillo · `#D1793F` naranja · `#C12D4C` rojo · `#406C9E` azul · `#6EA050` verde ·
`#6FA0BC` y `#83B6DD` azules secundarios.

### Fondo

- **Quitar** el degradado azul intenso de `html` (commit `4ef129a`) y **borrar**
  `components/BackgroundPaths.tsx` con su CSS (`.background-paths*`, `@keyframes trazo-fluir`).
- **Fondo nuevo, estático** (sin animación: nada que repinte detrás del texto):
  - `--ground: #F7F8FA` (claro) / `#12171C` (oscuro).
  - Capa `.fondo-rofe` fija (`position: fixed; inset: 0; z-index: -1; pointer-events: none`) con
    cinco `radial-gradient` grandes y suaves, uno por color: amarillo arriba-izquierda, naranja
    arriba-derecha, rojo a media altura derecha, azul abajo-izquierda, verde abajo-derecha.
    Opacidad **14–18 %** en claro y **8–10 %** en oscuro.
  - **Franja superior de 6 px** con los cinco colores en segmentos iguales (evoca las manos del logo).
- Los datos **nunca** van sobre color: todas las superficies de la Fase 1 son `--surface` opaco.
- Colores de marca solo en el fondo y los acentos de grupo que ya existen; **ninguna marca de datos
  nueva** en azul de marca (regla de daltonismo de `BRAND-DIGITAL.md`).

### Logo

- Copiar `C:\Users\EstudiantesJC\downloads\admin-usable\docs\img\logo_rofe_aplicacion2.png`
  → `web/public/logo-rofe.png` (352×409, PNG con transparencia; es la **Aplicación 2**, la del
  manual para uso digital).
- Reglas del manual: **full color siempre sobre blanco**, nunca distorsionar ni recolorear.
- **Encabezado** (`Marco` en `page.tsx`): el logo reemplaza al `eyebrow` "Fundación ROFÉ", a la
  izquierda del `h1`, con `next/image`, alto 64 px (48 px bajo 420 px), ancho proporcional,
  `alt="Fundación ROFÉ — Toca una vida"`. Queda sobre `.shell` blanco.
- **Modo oscuro:** el logo va dentro de una placa blanca redondeada (padding 6 px), nunca directo
  sobre fondo oscuro.
- **Login:** `.login-panel` pasa al fondo de paleta (sin el degradado azul) y `.login-content` es
  una tarjeta blanca opaca con el logo arriba. Las partículas pueden quedarse detrás.
- **Informe impreso:** logo de 40 px en `.report-header`, para que el PDF salga con marca.

**Aceptación:** claro y oscuro; ~400 px sin desplazamiento horizontal; logo sin deformar; impresión
con logo y sin fondo de color.

**Commit:** `feat(t19): fondo con paleta ROFE y logo`

---

## FASE 4 — Recorrido local y despliegue

Con `npm run dev` y la sesión de `soportejunior@tocaunavida.org`:

1. Los recorridos 1–9 de la Fase 3 de `PLAN-CIERRE-CODEX.md` siguen pasando
2. Los números de aceptación de la Fase 2 de este plan
3. Chip de fecha comprimido en tramos; quitar el chip limpia la onda
4. `Ver informe` → la onda aparece sin botones; `Descargar PDF` sale con logo
5. Comparar seleccionadas vs. no seleccionadas → fecha por mes
6. Solo teclado: tabular a los botones de atajo, a `Desde`/`Hasta` y moverlos con flechas

**No pruebes el export con PII** (TOC-40 es de Samuel).

Luego:

```bash
git push origin main
cd web && npm run verificar-acceso      # T11 OK: 6/6 contra producción
```

Si falla: **no cambies configuración de Vercel**; reporta la salida como bloqueo.

---

## FASE 5 — Documentación

**En `GROU`:** `README.md` (sección visual: Inter, onda de fecha, fondo ROFÉ, logo) y en
`HANDOFF-CODEX.md` una sección **"Cierre T19 — 2026-09-XX"**.

**En `admin-usable`** — ⚠ muchos cambios que no son tuyos: `git add` **archivo por archivo**,
nunca `-A` ni `.`; **no hagas push** (rama de trabajo de Samuel):

- `docs/procesos/panel-convocatoria-jc.md` §15: marcar qué quedó y cualquier desviación
- `claude_sessions.md`: entrada de 5–10 líneas al final

**Commit:** `docs: cierre T19 acabado visual`.

---

## Lo que NO haces tú (queda para Samuel)

| Qué | Issue |
|---|---|
| Probar a mano un export con PII | TOC-40 |
| Correos de Nati y Nata en la lista blanca, su primer login y **después** `disable_signup` | TOC-45 |
| Comunicar el hallazgo de ciudades a quien diseña los formularios | TOC-43 |
| Exports de PsicoSmart, SendGrid, Zapsign… | TOC-42 (post-beta) |
| Estado de las issues en Linear | Claude, con tu reporte |

## Definición de terminado

- [ ] F0 repo limpio · [ ] F1 sin `backdrop-filter`/`rotateY`, Inter, mínimo 12 px
- [ ] F2 onda con los números exactos de aceptación · [ ] F3 fondo paleta + logo claro/oscuro/impresión
- [ ] F4 desplegado, `T11 OK: 6/6` · [ ] F5 docs · [ ] suite 18/18 y build limpio

## Formato del reporte final

```
## Fases
F0 ✅/❌ <commit> — una línea
…
## Números de aceptación (Fase 2)
todo · 2025 · 2026 · ene 2026 · 2026-01-27
## Desviaciones del plan
## Bloqueos
```
