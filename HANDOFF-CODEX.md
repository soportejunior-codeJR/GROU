# Handoff para Codex — 2026-09-11

Todo lo que necesitas para avanzar sin preguntar. Los números de este documento están
**verificados contra las fuentes reales**, no estimados: si tu salida no cuadra con ellos,
la salida está mal, no el documento.

---

## 1. Lo que YA está hecho — no lo rehagas

| Pieza | Estado |
|---|---|
| **T1** `etl/extraer_convocatoria.py` | Correcto. 24.203 filas, cuadra fila por fila con las 8 fuentes |
| **T2** `etl/normalizar_convocatoria.py` | §4, §5 y §7 **verificados en verde** (2026-09-13). §6 `ciudad_norm` **reabierto**: poblado pero sin normalizar |
| **T3** `etl/migraciones/001_esquema_inicial.sql` | **Aplicada** en Supabase. No la corras ni la edites |
| **T6** `etl/migraciones/002_vistas.sql` | **Aplicada**. 5 vistas creadas |
| Infraestructura | 12 tablas, 5 vistas, RLS activa en las 12, `campo_no_preguntado` con 10 filas |
| Repo | `soportejunior-codeJR/GROU`, rama `main`, commit `03b8309` |
| Panel en producción | https://grou-tvsk.vercel.app — sirve, con login de Google y `/api/datos` devolviendo 401 sin sesión |
| Frontend | Andamio completo: auth, entrega protegida del dataset, `filtrar()` y `contarFacetas()`. Falta **solo la interfaz** |

Si necesitas consultar la base: usa la Management API con `CONV_SUPABASE_ACCESS_TOKEN`
(`POST https://api.supabase.com/v1/projects/qggvxetpszyluzzkmdbb/database/query`, cuerpo
`{"query": "..."}`). **La service key NO ejecuta DDL** — PostgREST es API de datos, no de
administración. Perdimos una vuelta descubriéndolo.

---

## 2. Credenciales

| Archivo | Para qué | Variables |
|---|---|---|
| `GROU/.env.local` | ETL | `CONV_SUPABASE_*`, `CONV_SUPABASE_ACCESS_TOKEN`, `PANEL_SUPABASE_*` |
| `GROU/web/.env.local` | Frontend | `NEXT_PUBLIC_SUPABASE_*`, `CONV_SUPABASE_URL`, `CONV_SUPABASE_SERVICE_ROLE_KEY` |

**Son archivos distintos con variables distintas.** Copiar uno sobre el otro rompe el de abajo:
ya pasó una vez y se perdieron las `PANEL_SUPABASE_*`, que son las que T5 necesita.

`PANEL_SUPABASE_*` apunta a `panel-datos-rofe`, la base del panel público. **De ahí solo se lee.**

---

## 3. Las reglas que no se negocian

1. **El canon es la población completa: 24.203 filas.** No la cohorte de 832 matriculados.
   `seleccionado` es un atributo filtrable como el estrato. Nunca recorta el universo y **nunca
   es denominador** de un porcentaje.
2. **Ninguna fila se descarta jamás.** Ni por cédula inválida, ni duplicada, ni sin match, ni
   enrutada fuera de cobertura. Se marca, no se borra. Si un script "limpia" filas, está mal escrito.
3. **`Sin dato` es una categoría contable, no un NULL que desaparece.** Toda segmentación tiene
   que sumar exactamente el universo vigente. Si un nulo se cae de una faceta, los segmentos dejan
   de sumar N y el conteo miente por omisión.
4. **`Sin dato` ≠ `No aplica`.** "No contestó" y "nunca se le preguntó" son cosas distintas. El
   estrato fuera de Colombia, y el inglés / índice de activos en Uruguay 2025, nunca se preguntaron.
5. **Toda paginación REST con `order=` explícito.** Sin él PostgREST no garantiza orden estable
   entre páginas y se repiten o pierden filas. Incidente real, 2026-09-08.
6. **Nada de PII sale del repo.** `etl/salida/` y `web/data/postulaciones.json` están
   gitignoreados a propósito.
7. **No inventes datos.** Si una fuente no tiene un campo, carga NULL y repórtalo. Un NULL honesto
   vale más que un 0 fabricado.

---

## 4. PRIORIDAD 1 — seis campos del requerimiento salieron 100 % vacíos

Sobre las 24.203 filas. Los seis aparecen en `etl/salida/preguntas_sin_mapear.txt`, o sea que
**el dato existe en la fuente y falló el mapeo**. Son campos que el cliente pidió por nombre.

| Campo | Cobertura actual | Criterio de aceptación |
|---|---:|---|
| `situacion_educativa` | 0 | Solo en COL 2026 debe dar 7.185 bachilleres / 2.204 grado 11 / 1.967 grado 10 |
| `comodidad_autonomo` | 0 | COL 2026: 8.293 alta / 2.481 media / 582 baja |
| `otros_programas` | 0 | COL 2026: 8.667 no / 951 espera / 934 rechazado / 804 aceptado |
| `condicion_laboral` | 0 | COL 2026: 4.456 con valor y 6.900 vacíos legítimos (no trabajan) |
| `anio_grado` | 0 | Complemento de situación educativa |
| `autorizo_datos` | 57 | El texto de la pregunta trae saltos de línea; el mapeo casi seguro se corta ahí |

`comodidad_autonomo` **aparece literalmente en el caso de uso que escribió el cliente**. No es un
campo secundario.

**Causa raíz probable:** el mapeo va por texto normalizado de la pregunta, y las cabeceras cambiaron
entre 2025 y 2026. **No mapees por posición de columna** — el orden también cambió: en COL 2025
`emprendimiento` está en el índice 29 y `condiciones laborales` en el 30; en COL 2026 están
invertidas.

---

## 5. PRIORIDAD 2 — `enviado_en` vacío en todo 2025

Tiene 13.572 no-nulos, que es **exactamente** el total de 2026. Las cuatro fuentes de 2025 quedaron
sin fecha: son 10.631 filas, el 44 % del universo.

El xlsx trae datetime real; los CSV traen texto `3/02/2025 18:04:03` en formato **día/mes/año** y el
parser no lo reconoce.

Importa más de lo que parece: `enviado_en` es la **única** respuesta que existe a la pregunta del
cliente "¿cuándo terminaron la aplicación?", y sin él no hay curva de inscripción de 2025.

---

## 6. PRIORIDAD 3 — `ciudad_norm` (REABIERTO 2026-09-13)

El campo ya no está vacío: tiene 24.203 de 24.203. **Pero no está normalizado.** Es el texto crudo
con los espacios recortados, y eso no sirve para un filtro.

Mi criterio de aceptación original decía solo "poblar `ciudad_alias`", sin una verificación
numérica como la que puse a los otros campos. Por eso pasó. Aquí va el criterio real.

### Lo que se midió (sobre las 22.605 postulaciones con datos, excluyendo las enrutadas)

- **610 nombres distintos**, de los cuales **444 tienen una sola fila**
- **56 grupos colapsan con solo quitar tildes y pasar a minúsculas**

| Ciudad real | Filas | Repartidas en | Variantes |
|---|---:|---:|---|
| Quito | 662 | 6 | `Quito` 646 · `QUITO` 10 · `quito` 3 · `𝑸𝒖𝒊𝒕𝒐` 1 · `Quitó` 1 · `Quito,` 1 |
| Paysandú | 340 | 3 | `Paysandú` · `Paysandu` · `paysandú` |
| Ciudad de Panamá | 267 | 9 | `Panamá` 159 · `Panama` 52 · `Ciudad de Panamá` 44 · `PANAMA` 4 · … |
| Durán | 39 | 3 | `Duran` 24 · `Durán` 13 · `DURAN` 2 |
| Panamá Oeste | 31 | 5 | con y sin tilde, con y sin mayúscula |
| Arraiján | 30 | 2 | con y sin tilde |
| Colón, La Chorrera, Daule, Guayas, Colonia del Sacramento | ~120 | 2-3 c/u | mismo patrón |

Colombia se ve bien **solo porque el formulario 2026 usaba lista desplegable**. Ecuador, Panamá y
Uruguay eran texto libre, y ahí está todo el daño.

**Impacto:** el filtro de ciudad — uno de los principales del pedido — mostraría Quito seis veces y
subcontaría todas las ciudades fuera de Colombia. Panamá aparecería partida en nueve.

### Qué hacer

1. **Plegado agresivo antes de buscar el alias:** NFKC (arregla el `𝑸𝒖𝒊𝒕𝒐`, que son caracteres
   matemáticos Unicode, no letras normales) → quitar tildes → minúsculas → quitar puntuación y
   espacios repetidos. Eso solo resuelve los 56 grupos.
2. **Alias explícitos para lo que el plegado no alcanza**, empezando por
   `Ciudad de Panamá` ≡ `Panamá` — son la misma ciudad y hoy están separadas.
3. **Valores que no son ciudades:** los nombres de país ya quedaron en `sin_dato`. **Falta un
   caso:** 6 filas traen una cédula o un teléfono en el campo de ciudad y hoy son 6 "ciudades"
   canónicas — seis valores que son cédulas o teléfonos, uno de ellos con un `.0` pegado
   por haberse leído como float. Van a
   `sin_dato` con la misma regla. Criterio: si al quitar dígitos y signos quedan 1 letra o menos,
   no es una ciudad.
   (De paso, ese `.0` final delata que el valor entró como float — vale la pena
   revisar que no haya más columnas leídas como número en vez de texto.)
4. **La cola de ciudades con una sola fila** déjala como está, pero escríbela a
   `etl/salida/ciudades_cola_larga.csv` para revisión humana posterior. Muchas son municipios
   reales; otras serán typos de las grandes.

   **Corrección de este documento (2026-09-13):** decía "444" y ese número describía los singletons
   del `ciudad_norm` *viejo* (el que no estaba normalizado). No es comparable con la cola de
   **crudos**, que es lo correcto de poner en el CSV. Las tres cifras, todas sobre las 22.605
   postulaciones con datos:

   | Medida | Singletons |
   |---|---:|
   | `ciudad_declarada` (crudo) — lo que va al CSV | **487** |
   | `ciudad_norm` viejo, sin normalizar — de donde salió el "444" | 444 |
   | `ciudad_norm` nuevo, ya normalizado | **387** |

   Que la cola crecra de 444 a 486/487 **no significa que se perdiera nada**: son poblaciones
   distintas. Normalizar solo puede reducir el número de categorías, nunca aumentarlo.
   El indicador que vale de aquí en adelante es **387**.

### Criterio de aceptación (este sí es verificable)

- **Cero grupos que colapsen** al aplicar NFKC + quitar tildes + minúsculas + quitar puntuación
- `Quito` = **662** en una sola categoría
- `Paysandú` = **340** en una sola categoría
- La capital panameña = **267** en una sola categoría
- Nombres canónicos distintos en las 22.605 reales: **por debajo de 560** (hoy 610)
- Ninguna ciudad canónica es un nombre de país

### Lo que sí quedó bien y no hay que tocar

`ciudad_alias` lleva `pais` correctamente: solo 5 casos aparecen bajo más de un país, de 1 a 2 filas
cada uno (alguien en el formulario de Ecuador escribió "Bogotá D.C."). Eso es dato real, no un bug.

---

## 7. PRIORIDAD 4 — separar Uruguay del hallazgo de cobertura

Hoy marcas **17 filas de UY 2025** como `enrutado_fuera_cobertura`. **Están mal clasificadas.**

El patrón real es este: el formulario enrutaba fuera del flujo a quien elegía una ciudad sin
programa. Se verificó y **aplica limpiamente a Colombia y Ecuador**:

| Fuente | Filas | Ciudades |
|---|---:|---|
| CO 2025 | 955 | Bucaramanga, Pasto, Valledupar, Santa Marta, Tunja, Armenia… (451 distintas) |
| EC 2025 | 626 | Cuenca 59, Santo Domingo 41, Loja 29, Santa Elena 21, Manta 14… **ninguna Guayaquil** |
| UY 2025 | 17 | **`ciudad = NULL`** |

Uruguay no encaja: ese formulario **ni siquiera abría preguntando ciudad** — abría con "¿Vivís
actualmente en Uruguay o en Colón o en Concepción del Uruguay?". Son formularios abandonados, no
demanda geográfica. Marcarlas como cobertura fabricaría un hallazgo que los datos no sostienen.

Necesitan bandera propia: `formulario_incompleto`.

---

## 8. T4 — cargador (`etl/cargar_convocatoria.py`)

`payload.json` → Supabase. Upsert por `(convocatoria, pais, fuente, fila_origen)`, que es la llave
de idempotencia declarada en el esquema. Multivalor: borrar e insertar por postulación. Lotes de 500.

**Gotcha que te va a morder:** `campo_no_preguntado` ya tiene **10 filas sembradas por la migración**
(incluye `estrato` para EC/UY/PA) y tu payload trae 5. Usa **upsert, no delete+insert**: si
reemplazas la tabla con el payload, te llevas por delante las 5 que sembró la migración.

**Aceptación:** correrlo dos veces seguidas deja el mismo conteo en las tablas. Log final con filas
insertadas, actualizadas y omitidas por tabla.

---

## 9. T5 — cruce con la cohorte matriculada (`etl/cruzar_canon.py`)

**Reescrito el 2026-09-13.** La versión anterior decía "6 de 6 por nombre → 832/832" y era
optimista: se midió con un diccionario que se quedaba con la primera coincidencia, así que
**nunca comprobó unicidad y no podía ver las ambigüedades**. Lo que sigue está medido de verdad.

### Fuente

De `panel-datos-rofe` con `PANEL_SUPABASE_*`: `cohorte_2026_ceds` (filtrar `programa=eq.jc`,
**en minúscula** — con `'JC'` devuelve 0 filas sin error), `retiros`, `aprobacion_cursos`,
`participants`. **`participants` no tiene columna `cedula`**; el puente es `cohorte_2026_ceds`.

### Regla 0 — el alcance (esto faltaba y es la causa de la ambigüedad extra)

**El cruce se limita a postulaciones de `convocatoria = '2026'`.** El canon es la cohorte JC 2026;
una persona solo pudo entrar por la convocatoria 2026.

Esto no es un detalle:

- **63 personas del canon también se postularon en 2025.** Sin acotar el alcance, sus postulaciones
  de 2025 quedarían marcadas `seleccionado=true` — 63 filas falsas, y el test 7 (exactamente 832)
  fallaría sin que se entienda por qué.
- Las ambigüedades por nombre pasan de **2 a 1** al acotar. La segunda era un choque contra una
  postulación de 2025 de la misma persona.

La fila de 2025 de esas 63 personas queda `seleccionado=false`, que es la verdad histórica: en esa
convocatoria no fueron seleccionadas.

### Algoritmo

1. **Por `cedula_norm`** (solo dígitos, sin ceros a la izquierda), contra postulaciones 2026.
   Alcanza **826 de 832**. Si tu script reporta 745, falta el `lstrip("0")`.
2. **Por `nombre_norm`** (NFKD → ASCII → minúsculas → solo `[a-z ]` → tokens **ordenados
   alfabéticamente**) para las 6 restantes, también solo contra 2026. Da **5 únicas y 1 ambigua**.
3. La ambigua se resuelve con la Regla 2.

### Regla 1 — una persona, una postulación marcada

Cinco cédulas del canon tienen **dos** postulaciones en 2026 (envíos duplicados: mismo nombre,
misma ciudad, con días de diferencia):

| Caso | Postulaciones | Ciudad |
|---|---|---|
| A | id 20390 (10-feb) · id 21860 (15-feb) | Medellín |
| B | id 16759 (28-ene) · id 21466 (13-feb) | Bogotá D.C. |
| C | id 21243 · id 21246 (**ambas 12-feb**) | Bogotá D.C. |
| D | id 11966 (26-ene) · id 20724 (11-feb) | Bogotá D.C. |
| E | id 11509 (23-ene) · id 21877 (15-feb) | Cali |

*(Las cédulas no se escriben aquí: el repo es público. Se identifican por `id_publico`,
que no revela a la persona. Para verlas, consulta `postulaciones_pii` con la service key.)*

**Regla:** `seleccionado = true` va en la **más reciente por `enviado_en`**; en empate, la de
**mayor `id_publico`** (caso C, con las dos del 12-feb). Las demás quedan `seleccionado = false`
y con `duplicado_de = id_publico` de la elegida.

Ninguna fila se descarta — se marca, como manda la regla 2 del §3. Y así el test 7 sigue dando
exactamente 832.

### Regla 2 — la ambigüedad por nombre

Un solo caso, ya acotado a 2026:

```
canon: cedula C  (una persona del canon, Paysandú)
  id 23989  cedula C con 1 digito distinto   2025-11-26  Paysandú  (UY, conv. 2026)
  id 24012  cedula C con 2 digitos distintos  2025-12-05  Paysandú  (UY, conv. 2026)
```

Misma convocatoria, misma ciudad, mismo `nombre_norm`, y las dos cédulas difieren del canon en uno
y dos dígitos. **Es la misma persona postulándose dos veces con la cédula mal digitada las dos
veces**, no dos personas distintas. Se resuelve con la **misma Regla 1**: marca la más reciente
(id 24012) y pon `duplicado_de` en la otra.

Cuál de las dos filas lleva la bandera **no cambia ningún conteo** — es la misma persona y solo una
puede llevarla. Por eso se usa la regla simple y consistente en vez de inventar un criterio aparte.

**Guardarraíl — cuándo NO decidas automáticamente:** aplica la Regla 1 solo si los candidatos
comparten **convocatoria, `ciudad_norm` y `nombre_norm` idéntico**. Si difieren en cualquiera de
las tres, son potencialmente personas distintas: déjalos sin match, `seleccionado=false`, y
escríbelos en `etl/salida/matches_ambiguos.csv`. **No inventes una desempate nuevo.**

### El esquema — ya está listo (2026-09-13)

`duplicado_de` **no existía** cuando escribí la §9: la inventé y no la agregué al esquema. Por eso
T5 murió con `400 / 42703 column does not exist`. Error mío, ya corregido.

`etl/migraciones/003_duplicado_de.sql` **está aplicada y verificada** en Supabase (idempotente,
corrida dos veces). `resultado_seleccion` ahora tiene `duplicado_de integer null`, con índice
parcial y un check de que sea positivo. **No la vuelvas a correr ni la edites.**

**Lo que sí te toca a ti:** exponer `duplicado_de` en `v_analisis_postulaciones`, dentro de
`002_vistas.sql`, **al final de la lista de columnas**. Postgres deja agregar columnas al final con
`create or replace view`; lo que no deja es quitarlas, renombrarlas ni reordenarlas. Sin esa
columna el panel no puede distinguir una postulación duplicada de una que simplemente no fue
seleccionada, y el usuario vería dos filas idénticas sin explicación.

### Qué escribir

`resultado_seleccion` para **las 24.203** postulaciones, no solo para las 832: una sin match es una
fila con `seleccionado=false`, jamás una fila ausente. Al terminar,
`count(resultado_seleccion) == count(postulaciones)`.

`resultado_programa` (retiro, avance, cursos aprobados) solo para las marcadas.

En `matches_ambiguos.csv` registra **todo lo resuelto por las Reglas 1 y 2**, no solo lo que quede
sin resolver: son 6 filas que una persona debe poder auditar después.

**Caso Medellín:** la hoja `MED` del workbook tiene columna `Estado` (Seleccionados / No
seleccionados) para 1.236 personas. Es el **único** rechazo explícito de toda la fuente. Cárgalo
donde exista.

### Aceptación

- **832** filas con `seleccionado = true` — todas de convocatoria 2026
- **6** filas con `duplicado_de` poblado (5 de la Regla 1 + 1 de la Regla 2)
- `count(resultado_seleccion) == count(postulaciones) == 24.203`
- `matches_ambiguos.csv` con las 6 resoluciones documentadas
- El script **sale con código ≠ 0 si no llega a 832**. Un match parcial silencioso es peor que un
  error. Si aparece una ambigüedad nueva que el guardarraíl no cubre, que falle y avise: la decide
  un humano, no el script.

---

## 10. T7 — suite de integridad (`etl/test_integridad_convocatoria.py`)

Cada test imprime OK/FALLA; el script sale ≠ 0 si algo falla.

1. Conteos por fuente: 11.356 / 1.430 / 567 / 219 / 7.977 / 90 / 2.213 / 351 = **24.203**
2. `id_publico` único y sin huecos
3. Toda `postulaciones` tiene exactamente una fila en `postulaciones_pii`
4. Todo dominio cerrado solo contiene valores del catálogo
5. `estrato` NULL en el 100 % de EC/UY/PA, no-nulo en ≥ 99 % de CO
6. `edad` entre 10 y 80 en ≥ 99 %; las excepciones se listan
7. `seleccionado = true` cuenta exactamente **832**
8. `indice_activos` NULL en el 100 % de UY 2025, no-nulo en ≥ 99 % del resto
9. `enrutado_fuera_cobertura`: 955 en CO 2025, 626 en EC 2025, **0 en UY**, 0 en toda 2026
10. **(REDEFINIDO 2026-09-13)** La cobertura es por par **(país, ciudad)**, no por ciudad sola.
    Barranquilla tiene cobertura en Colombia y no en Ecuador. Los pares cubiertos son:
    `CO`: Barranquilla · Bogotá D.C. · Cali · Cartagena de Indias · Medellín · Valle de Aburrá ·
    `EC`: Guayaquil.
    Bajo ese criterio, de las 34 filas que fallaban: **10 son enrutamiento correcto** (gente que
    llenó el formulario del país equivocado) y **24 son fricción real** — 18 en `CO`/Cartagena de
    Indias y 6 en `EC`/Guayaquil.
    **El test afirma exactamente 24 y las lista.** No es un cero: es un guardián de regresión sobre
    un hallazgo conocido. Si sube o baja, algo cambió en la normalización y hay que mirarlo.
11. **Anon no puede leer `postulaciones_pii`**: debe dar `permission denied` (401/42501), **no una
    lista vacía**. Una lista vacía sobre tabla vacía es un falso OK que se rompe al cargar datos.
12. Seleccionados por ciudad vs. hojas `BOG selec` (149) y `MED JC` (110): reportar la diferencia.
    No se espera cuadre exacto — son de Fase 3, no de matrícula. Lo que importa es que quede escrita.
13. `count(resultado_seleccion) == count(postulaciones)`
14. **Toda segmentación suma el universo:** para cada campo categórico de
    `v_analisis_postulaciones`, `sum(count(*)) group by campo` == `count(*)` de la vista
15. `count(postulaciones)` == suma de líneas de los `.jsonl` de T1 (24.203)

Los tests 14 y 15 son los que atrapan las dos fallas más caras: un NULL que se cae de una faceta, y
un descarte silencioso. Ninguna de las dos se nota mirando el panel.

---

## 11. T8 — la interfaz (`web/app/page.tsx`)

**Reescrito 2026-09-13, con los datos ya cargados.** La vista tiene 52 columnas, 24.203 filas,
832 con `seleccionado = true` y 6 con `duplicado_de`.

### Paso 0 — datos reales antes de tocar la interfaz

```bash
cd web && npm run dataset
```

Hasta ahora el panel servía `postulaciones.ejemplo.json` (300 filas sintéticas). Esto trae las
24.203 reales. Verifica en el log que diga 24.203 y **no** "se usa ejemplo". Si el archivo pesa más
de ~3 MB, revisa la codificación columnar antes de seguir: el objetivo era ~1,5 MB.

### Lo que ya existe y NO se reescribe

| Archivo | Qué resuelve |
|---|---|
| `web/lib/dataset.ts` | Contrato del formato **y** `filtrar()` + `contarFacetas()` |
| `web/lib/auth.ts` + `auth.config.ts` | Login, lista blanca, cliente perezoso |
| `web/app/api/datos/route.ts` | Valida sesión y correo antes de servir |
| `web/scripts/construir-dataset.mjs` | Hornea el dataset en el build |

### La cascada — lo único que se hace mal por defecto

El número junto a cada opción de un filtro se calcula sobre el universo filtrado por **todos los
demás filtros excepto el propio**. Para eso existe el parámetro `omitir` de `filtrar()`. Así el
usuario ve cuánto sumaría cada opción *antes* de marcarla, y una que quedaría en cero se muestra en
cero en vez de desaparecer.

Filtrar sobre el universo ya reducido por el propio filtro es "filtros encadenados" y es otra cosa.
**Usa `contarFacetas()`. No recuentes a mano.**

Dos modos, ambos pedidos explícitamente: `TODAS` (cumple todos los filtros activos) y
`AL_MENOS_UNA` (cumple al menos uno).

### Reglas de conteo

- Encabezado permanente: `N de 24.203 postulaciones · M seleccionadas · X %`.
  **`X` es `M/N`, jamás sobre 832.** Todo porcentaje declara su base en pantalla.
- `Sin dato` es una opción visible en cada filtro, con su conteo, y filtrable. No se esconde ni se
  agrupa. En varios campos "no contestó" es en sí mismo un patrón que el cliente va a querer mirar.
- Para los numéricos usa las columnas compañeras que ya existen — `edad_estado`,
  `promedio_estado`, `estrato_cat`, `nucleo_estado`, `indice_activos_estado` — que son las que
  distinguen `sin_dato` de `no_aplica`. Un `integer` no puede llevar la categoría; la lleva su
  compañera.
- Las **6 filas con `duplicado_de`** cuentan en las 24.203: son postulaciones reales. Solo no
  llevan la bandera de seleccionado. Muéstralas con una marca discreta en la tabla. Un interruptor
  "ocultar envíos duplicados" es bienvenido pero opcional.

### Filtros a exponer

**Identidad y origen:** `convocatoria` · `pais` · `ciudad` · `fecha_envio` (rango)
**Perfil:** `edad` · `genero` · `situacion_educativa` · `promedio_pct` · `segmentos` (multi)
**Situación:** `ocupaciones` (multi) · `condicion_laboral` · `emprendimiento` · `otros_programas`
**Socioeconómico:** `estrato` · `ingreso_hogar` · `personas_nucleo` · `tipo_vivienda` ·
`indice_activos`
**Capacidad:** `tiene_internet` · `acceso_computador` · `horas_semanales` · `comodidad_autonomo` ·
`nivel_ingles` · `nivel_software`
**Origen del contacto:** `como_se_entero` (multi) · `tiene_embajador`
**Resultado:** `seleccionado` · `fase_max_alcanzada` · `retirado` · `pct_avance` ·
`cursos_aprobados` · `estado_final` · `aplico_antes_jc` · `fue_beneficiario_antes`
**Calidad del dato:** `enrutado_fuera_cobertura` · `edad_valida`

### Las tres vistas, en orden de prioridad

**1. Explorador — completo, sin recortes.** Panel de filtros con conteo por faceta, encabezado con
el total vivo, chips de filtros activos removibles, "limpiar todo", tabla paginada del subconjunto.
Rangos numéricos con slider doble; categóricos con multiselección y buscador. **Es el pedido
literal del cliente: media cascada no sirve para nada.**

**2. Distribuciones — versión mínima aceptable.** Un histograma por campo filtrado, con
**seleccionados y no seleccionados lado a lado**. Eso es lo que responde "identificar patrones",
que es el caso de uso que el cliente escribió.

**3. Embudo — el primero que se sacrifica si falta tiempo.** Postularon → matriculados por ciudad.
Los estados intermedios van marcados como "sin fuente". **No dibujes un embudo completo que insinúe
datos que no tenemos** (§13).

### Transversal

- **URL sincronizada con los filtros**, para compartir un hallazgo pegando el enlace.
- **Exportar el subconjunto a CSV**, sin PII, con `id_publico` como identificador.

### Estilo

Mínimo funcional. El cliente decidió definir el estilo visual **después** de ver la beta, sobre
algo que ya funciona. No inviertas tiempo ahí todavía.

### Gotchas ya pagados

- **No crees el cliente de Supabase al cargar el módulo.** `createClient` lanza
  `supabaseUrl is required` con variables vacías, y en el prerender del build lo están: tumba
  `next build` entero. Va perezoso, como `clienteAuth()`.
- **Nada de PII.** La vista ya no la expone. Si aparece un nombre o un correo en el panel, el error
  está en la vista y se corrige allá, no filtrando en la interfaz.
- Vercel despliega con **Root Directory = `web`** y Framework Preset **Next.js**. Ya está
  configurado; si un deploy sale en 2 segundos o pide un directorio `public`, alguien lo movió.

### Aceptación

- `npm run build` en verde y el deploy sirviendo las 24.203 reales, no el ejemplo
- Encabezado mostrando `24.203 · 832 · 3,4 %` sin filtros activos
- Marcar un filtro cambia los conteos de **todos los demás** y no los del propio
- Cambiar de `TODAS` a `AL_MENOS_UNA` sube el conteo (o lo deja igual), nunca lo baja
- Para cualquier campo categórico, la suma de sus facetas == total vigente
- El caso de uso del cliente se puede reproducir de punta a punta: *18 años + con emprendimiento +
  ingreso del hogar en un rango + estrato 3 + cómodos con aprendizaje autónomo + no seleccionados*
- El enlace copiado reproduce los mismos filtros en otra pestaña

---

## 12. T9 — cierre documental

En el repo `admin-usable` (vault del equipo):

1. Actualizar `docs/procesos/panel-convocatoria-jc.md` con lo que descubras al ejecutar
2. Agregar los scripts nuevos a `docs/procesos/mapa-codigo.md` con su firma
3. Mover el proceso en `docs/00-vision-global.md` a completado
4. Entrada al final de `claude_sessions.md`

---

## 13. Lo que este panel NO hace todavía

El embudo está **truncado en dos estados** (postuló → matriculado). Las fases 2 y 3, la entrevista,
el motivo de rechazo y las pruebas psicotécnicas **no existen en ninguna fuente entregada**: viven
en PsicoSmart, SendGrid, Google Calendar y Zapsign, y esos exports están pendientes del cliente.

El modelo ya tiene los espacios reservados y vacíos (`fase_max_alcanzada`, `motivo_no_seleccion`).
Sumarlos después es un `UPDATE`, no un rediseño. **No los rellenes con nada mientras tanto.**

---

## 14. Orden sugerido

1. §4 (los seis campos) → correr T2 → verificar contra los criterios de aceptación
2. §5 `enviado_en` · §6 `ciudad_norm` · §7 Uruguay → correr T2 de nuevo
3. **Avisa antes de T4** para revisar la cobertura con ojos frescos
4. T4 → T5 → T7 completo en verde
5. T8
6. T9

Después de T4, `npm run dataset` en `web/` ya trae datos reales en vez del archivo de ejemplo, y el
siguiente push a `main` los despliega solo.

---

## 15. Las 24 de fricción — qué son y por qué no se "arreglan"

Salieron del test 10 y **no son un error del dato**: son personas que viven en una ciudad **con**
programa y a las que el formulario sacó del flujo por cómo escribieron el nombre de su ciudad.

| Lo que escribieron | Filas | Lo que el formulario esperaba |
|---|---:|---|
| `Cartagena` | 13 | `Cartagena de Indias` |
| `Cartagena, Bolívar` · `Cartagena bolivar` · `Cartagena Bolivar` · `Cartagena- Colombia` | 4 | idem |
| `Cartagena de indias` (minúscula) | 1 | idem |
| `Guayaquil` y `Guayaquil Guasmo Sur` en el form de Ecuador | 6 | `Guayaquil` exacto |

**No se corrigen retroactivamente.** Esas personas efectivamente no completaron el formulario: no
tenemos sus datos y no se les puede inventar una postulación. La bandera
`enrutado_fuera_cobertura` describe **lo que pasó**, y eso es correcto.

**Sí hay que poder verlas en el panel.** Es una respuesta directa a la pregunta del cliente sobre
fricciones en el proceso: *18 personas de Cartagena quedaron fuera por escribir el nombre de su
ciudad sin "de Indias"*. Para la próxima convocatoria eso se arregla con una lista desplegable en
vez de texto libre — que es exactamente lo que Colombia ya hizo en 2026, y por eso Colombia 2026
tiene cero casos.

**Limitación conocida del esquema:** `ciudad_alias` tiene la PK en `ciudad_cruda` sola, así que el
mismo texto no puede mapear a dos países — y `Guayaquil` aparece tanto en el formulario de Colombia
como en el de Ecuador. Por eso la cobertura **no** se lee de `ciudad_alias.tiene_cobertura`: se
evalúa contra el par (país, ciudad). Si más adelante el panel necesita cobertura por convocatoria
(Panamá solo existió en 2026), eso pide una tabla `cobertura_programa (pais, ciudad_norm,
convocatoria)`. Hoy no hace falta.

---

# T10 — Gráficos por filtro, export con PII y mejora visual

Pedido del cliente tras ver la beta del Explorador (2026-09-13). Tres frentes
independientes; se pueden hacer en cualquier orden, pero **T10.0 es requisito de T10.3**.

---

## T10.0 — Partir `page.tsx` antes de tocar nada visual

Hoy son 47 líneas con líneas de más de 2.000 caracteres. Funciona, pero cualquier trabajo visual
encima se vuelve imposible de revisar y de revertir.

Sepáralo primero, sin cambiar comportamiento:

```
web/components/FiltroCard.tsx      la tarjeta de un filtro (cara de control + cara de gráfico)
web/components/GraficoFaceta.tsx   el gráfico, elegido por tipo de campo
web/components/TablaResultados.tsx la tabla
web/components/Encabezado.tsx      el contador vivo y los botones de export
web/lib/urlFiltros.ts              encodeFilter / parseUrl
```

`page.tsx` queda como composición. **Commit aparte, antes de empezar lo demás**, para que el diff
de la parte visual sea legible.

---

## T10.1 — Export CSV **con** PII

El cliente lo necesita para poder contactar gente. Se construye, pero **la PII nunca entra al
bundle del navegador**: son ~21.400 personas, muchas menores de edad, y el dataset horneado lo
descarga completo cualquiera que abra el panel. Va por una ruta de servidor que consulta Supabase
en el momento.

### Ruta nueva: `web/app/api/exportar-pii/route.ts`

1. `POST` con `{ ids: number[] }` — los `id_publico` del subconjunto filtrado.
2. Valida **igual que `/api/datos`**: token de sesión + correo en `CORREOS_PERMITIDOS`. Sin eso, 401.
3. Consulta `postulaciones_pii` **del lado del servidor** con `CONV_SUPABASE_SERVICE_ROLE_KEY`,
   uniendo por `id_publico`, solo las filas pedidas.
4. Devuelve el CSV como `text/csv` con `Content-Disposition: attachment`.
5. Tope duro: **5.000 filas por export**. Por encima, 413 con un mensaje que diga que hay que
   filtrar más. Exportar las 24.203 de una es un volcado completo de la base, no un análisis.

### Auditoría — migración 004

```sql
create table if not exists export_log (
  id          uuid primary key default gen_random_uuid(),
  correo      text not null,
  filas       integer not null,
  filtros     jsonb,
  creado_en   timestamptz not null default now()
);
```

RLS deny-all como todo lo demás. La ruta escribe una fila por export. **No guarda los ids ni los
datos exportados**, solo quién, cuándo y cuántos: alcanza para auditar y no duplica la PII.

### En la interfaz

Dos botones separados y rotulados sin ambigüedad:

- `Exportar CSV` — el actual, sin datos personales
- `Exportar con datos personales` — visualmente distinto (contorno de advertencia), con un diálogo
  de confirmación que diga cuántas filas y qué campos incluye antes de descargar

Campos del export con PII: `id_publico`, `cedula_cruda`, `nombres`, `apellidos`, `email`,
`celular`, `ciudad`, `convocatoria`, `seleccionado`. **No** incluyas dirección, barrio ni datos del
acudiente: no hacen falta para contactar y son lo más sensible del registro.

---

## T10.2 — El gráfico de cada filtro

### De dónde salen los números — no hay cálculo nuevo

`contarFacetas(ds, campo, filtros, modo)` ya devuelve exactamente lo que el cliente describió: el
conteo de cada opción sobre el universo filtrado por **todos los demás filtros menos el propio**.
Eso es "limitadas por los filtros anteriores". El gráfico es una forma de dibujar números que ya
existen. **No escribas un agregador nuevo.**

### La forma depende del campo — no todo es una dona

| Tipo | Categorías | Forma | Por qué |
|---|---|---|---|
| `cat` / `bool` | ≤ 6 | **Dona** | Lo que pidió el cliente, y con pocas porciones se lee bien |
| `cat` | 7 – 20 | Barras horizontales ordenadas | Una dona de 15 porciones no se lee |
| `cat` | > 20 (`ciudad` tiene 546) | Barras horizontales, top 10 + "Otras (N)" | Idem, y el top es lo que importa |
| `multi` | cualquiera | **Barras horizontales, nunca dona** | Una persona cuenta en varias categorías: las porciones no suman el total y una dona mentiría |
| `num` | — | Histograma, con el rango elegido en azul | Un rango no es una categoría |

Ese renglón de `multi` no es estética: `segmentos`, `ocupaciones` y `como_se_entero` son
multivalor. Dibujarlos como dona daría un círculo que suma más de 100 %.

### Color — validado, no elegido a ojo

Es resaltado (seleccionado vs resto), no identidad. Dos colores y nada más:

| | Seleccionado | Resto |
|---|---|---|
| Claro | `#1f6feb` | `#6b7280` |
| Oscuro | `#3b8eea` | `#717a85` |

Ambos pares pasan separación para daltonismo (ΔE 17,8 claro · 15,3 oscuro, muy por encima del piso
de 8) y contraste ≥ 3:1 contra su superficie. **No los cambies sin volver a validarlos.** El modo
oscuro tiene sus propios valores a propósito: no es el claro invertido.

Sin selección: todo en gris. Con selección: la elegida en azul, el resto gris.

### Detalles de dibujo

- Separación de 2 px entre porciones y entre barras, del color de la superficie.
- Extremo de barra redondeado 4 px, anclado a la línea base.
- **Etiqueta directa siempre sobre la porción seleccionada** (valor y %); sobre las demás solo si
  caben sin chocar.
- Tooltip al pasar el cursor con el conteo exacto y el % — en todas las formas.
- Los textos usan los tokens de texto, **nunca el color de la serie**.
- Sin leyenda: hay una sola serie resaltada y el título de la tarjeta ya la nombra.
- Rejilla y ejes recesivos.
- En el centro de la dona, el % de lo seleccionado. Sin selección, el total del universo vigente.

Recharts ya está en `package.json`. Úsalo o dibuja SVG a mano — una dona son dos arcos y las barras
son rectángulos. **No agregues una librería nueva.**

### El giro

- Cada tarjeta de filtro lleva arriba a la derecha un botón pequeño con ícono de barras.
- Al pulsarlo la tarjeta **gira** (transform 3D, ~250 ms) y muestra la cara del gráfico. El mismo
  botón, o uno de volver, la devuelve.
- Cuando el campo tiene algo seleccionado, el botón queda en estado activo para que se note que
  hay algo que ver. **El giro automático al seleccionar queda opcional** — pruébalo, y si marca
  cada clic con una animación resulta mareante, déjalo solo manual.
- Con `prefers-reduced-motion: reduce`, cruce de opacidad en vez de giro.
- La cara del gráfico **no** pierde el control: deja abajo un resumen de lo seleccionado y el botón
  de limpiar ese filtro.

---

## T10.3 — Mejora visual

Requiere T10.0 hecho.

- **Tokens en `globals.css`** para claro y oscuro: superficie, superficie-2, tinta, tinta-2,
  tinta-3, línea, acento. Ningún color literal dentro de un componente.
- **Las tarjetas de filtro son un objeto repetido**: mismos bordes, mismo relleno interno, el botón
  de gráfico siempre en el mismo sitio. Es lo que hace que una grilla de 30 filtros se lea.
- **Encabezado fijo** con el contador vivo (`N de 24.203 · M seleccionadas · X %`) y los chips de
  filtros activos, para no perder el número al hacer scroll.
- Jerarquía tipográfica real: los grupos de filtros no pueden verse igual que los nombres de campo.
- `font-variant-numeric: tabular-nums` en todo número que se compare en columna.
- Debe funcionar a ~400 px de ancho: la grilla colapsa a una columna.

El estilo concreto es tuyo. Lo que no es negociable: que funcione en claro y oscuro, que el
contraste de texto pase, y que los colores del gráfico sean los validados de arriba.

---

## Aceptación de T10

- `page.tsx` por debajo de 120 líneas, con los componentes separados
- Export con PII: 401 sin sesión · 401 con correo fuera de la lista · 413 por encima de 5.000 filas
  · una fila en `export_log` por cada export exitoso
- La PII **no** aparece en `web/data/postulaciones.json` ni en ningún chunk del bundle
- Gráfico correcto por tipo: dona en `pais`, barras en `ciudad`, barras en `segmentos`, histograma
  en `edad`
- Elegir `2025` en `convocatoria` muestra la dona con 2025 en azul y 2026 en gris, y los números
  coinciden con `contarFacetas`
- Los gráficos respetan los filtros previos: con `pais = CO` puesto, la dona de `convocatoria`
  muestra solo colombianos
- Claro y oscuro verificados en ambos, no solo en uno
- `npm run build` en verde

---

# T11 — Verificador externo de acceso

## El fallo que motiva esto

Durante horas dimos el despliegue por bueno porque desde el navegador de Samuel el panel cargaba.
Lo que se veía era el efecto de una **cookie de sesión de Vercel**: para cualquier otra persona —y
para él mismo desde el teléfono— la raíz, `/api/datos` y todo lo demás devolvían 401.

```
GET /                        401  {"protection":{"auto_vercel_auth_redirect":true,…}}
GET /api/datos               401  (cuerpo de Vercel, NO el nuestro)
GET /data/postulaciones.json 401
```

Causa: `Settings → Deployment Protection → Vercel Authentication` estaba en **All Deployments**, que
exige cuenta de Vercel y pertenencia al equipo antes de llegar a nuestro login.

**Ese error se repite solo.** Revisar desde el navegador de uno es lo natural, y es exactamente lo
que lo esconde. La corrección de la configuración la hace Samuel en el panel de Vercel — no es
delegable en código. Lo que sí se puede automatizar es **no volver a engañarse**.

## Lo que hay que construir

`web/scripts/verificar-acceso.mjs`, ejecutable con `npm run verificar-acceso`. Sin dependencias
nuevas: `fetch` nativo alcanza.

Golpea la URL de producción (`https://grou-tvsk.vercel.app`, configurable con `PANEL_URL`) con
**cabeceras limpias** — nada de cookies, nada de credenciales — y comprueba:

| # | Comprobación | Esperado |
|---|---|---|
| 1 | `GET /` | 200, y el HTML contiene `Panel de Convocatoria` |
| 2 | **El 401 es nuestro, no de Vercel** | el cuerpo trae `Sesion requerida`; si trae `"protection"` o `auto_vercel_auth_redirect`, **falla y dilo con esas palabras** |
| 3 | `GET /api/datos` sin sesión | 401 |
| 4 | `POST /api/exportar-pii` sin sesión, cuerpo `{"ids":[1]}` | 401 |
| 5 | `GET /data/postulaciones.json` | 404 — el dataset nunca es público |
| 6 | `GET /_next/static/css/...` o la raíz | el CSS carga (un panel sin estilos ya pasó una vez) |

La 2 es la que faltaba y la razón de ser del script: **un 401 no basta, hay que saber quién lo
puso.** Un 401 de Vercel y uno nuestro significan cosas opuestas — el primero dice "nadie puede
entrar", el segundo dice "la protección funciona".

## Salida

Una línea por comprobación con `OK` o `FALLA`, y un resumen final. **Sale con código ≠ 0 si algo
falla**, para poder encadenarlo.

Cuando la 2 falle, el mensaje debe decir explícitamente qué hacer:

```
FALLA  El 401 lo pone Vercel, no la app.
       Settings → Deployment Protection → Vercel Authentication
       debe estar en "Only Preview Deployments" o desactivado.
```

## Aceptación

- [ ] `npm run verificar-acceso` corre y sale ≠ 0 cuando algo falla
- [ ] Distingue el 401 de Vercel del nuestro, con el mensaje de arriba
- [ ] Documentado en el README: **correrlo después de cada cambio de configuración de Vercel**
- [ ] Con la configuración actual (protección activa) el script **falla** — esa es la prueba de que sirve
- [ ] Cuando Samuel la corrija, el script pasa entero

## Lo que este script NO reemplaza

Abrir el panel desde un teléfono, fuera de la red del portátil. El script comprueba que la puerta
está abierta; solo una persona comprueba que adentro se ve bien.

---

# T12 — Auditoría de filtros: correcciones y datos de curso

Auditoría de Samuel sobre el panel, 2026-09-14. **Antes de tocar nada, lee la sección "Lo que NO
está roto"**: tres de los problemas reportados no lo son, y corregirlos rompería dato correcto.

---

## 0. Lo que NO está roto — no lo toques

### `aplico_antes_jc` / `fue_beneficiario_antes` están bien

Verificado contra la base para el caso que reportó el cliente (una postulación de
Barranquilla, convocatoria 2026, seleccionada):

```
aplico_antes_jc: False · fue_beneficiario_antes: False · seleccionado: True
```

La sospecha nació de leer la última columna del CSV de exportación. Sus columnas son
`id_publico, cedula, nombres, apellidos, email, celular, ciudad, convocatoria, seleccionado`,
así que ese `"true"` final es **`seleccionado`**, que es correcto — sí fue seleccionado.

Distribución global, coherente: 20.343 con ambos en `false`, 982 aplicaron antes sin ser
beneficiarios, 105 ambas cosas, 54 beneficiarios que no marcaron haber aplicado.

**Acción: ninguna.** Lo que sí hay que arreglar es que el CSV salga con encabezados legibles.

### `retirado` está bien

En la vista ya sale como texto de tres valores, no booleano:
`no_aplica` 23.371 · `no` 740 · `si` 92. El estudiante del ejemplo sale `no`, que es correcto.

**Acción: ninguna sobre el dato.** El problema real es que la caja del filtro se muestre para
quien nunca entró al programa — eso lo resuelve §4.

### El promedio de 2026 no falta: no se preguntó

`promedio_academico` está vacío en **toda** la convocatoria 2026 salvo Uruguay. Verificado contra
los formularios originales: **el formulario 2026 de Colombia, Ecuador y Panamá no incluye la
pregunta.** En 2025 sí estaba.

No es un fallo de mapeo. Es `no_aplica`, y hoy se muestra como `sin_dato`, que dice algo distinto
y falso: que la persona no contestó.

**Acción:** sembrar en `campo_no_preguntado` las entradas `2026/CO`, `2026/EC` y `2026/PA` para
`promedio_academico`, y que la vista los saque como `no_aplica`.

---

## 0-bis. CORREGIDO — cuatro filtros marcaban "Si" para las 24.203 personas

**Ya esta arreglado (no lo rehagas), pero lee por que, porque la leccion aplica a todo el panel.**

`tiene_internet`, `aplico_antes_jc`, `fue_beneficiario_antes` y `retirado` mostraban **"Si" para
las 24.203 filas**. El cliente lo vio en pantalla; nosotros no.

**Causa:** la vista devuelve esos campos como TEXTO de tres valores (`si` / `no` / `no_aplica`),
que es lo correcto para poder expresar "no aplica". Pero `construir-dataset.mjs` los tenia en la
lista `BOOLEANOS` y hacia `f[campo] ? 1 : 0`. En JavaScript **cualquier cadena no vacia es
verdadera**, asi que `'no'` se convertia en 1 = "Si".

`seleccionado` y `enrutado_fuera_cobertura` se salvaron solo porque la vista SI los devuelve como
booleanos reales.

**Valores correctos, ya verificados:**

| Campo | Distribucion real |
|---|---|
| `tiene_internet` | 21.406 si · 645 no · 2.152 sin dato |
| `aplico_antes_jc` | 20.397 no · 1.087 si · 2.719 sin dato |
| `fue_beneficiario_antes` | 21.325 no · 159 si · 2.719 sin dato |
| `retirado` | 23.371 no aplica · 740 no · 92 si |

**El arreglo:** ya no se confia en la lista. `esBooleanoDeVerdad()` mira el dato y solo trata como
booleano lo que realmente lo es; el resto cae en la rama categorica, donde `si`/`no`/`no_aplica`
se convierten en tres categorias correctas.

### Las dos lecciones

1. **Ninguna prueba lo detecto**, porque la suite verifica la BASE y ahi el dato siempre estuvo
   bien. El fallo estaba en la traduccion base -> dataset horneado, que nadie comprobaba.
   **Falta una prueba que compare el dataset contra la base**: para cada campo, que la
   distribucion del JSON coincida con un `group by` en Supabase. Anadela a T12.
2. **Una lista escrita a mano se desincroniza del esquema en silencio.** La vista cambio de
   booleano a texto —con razon— y la lista se quedo como estaba. Donde se pueda, mirar el dato.

---

## 1. Edad — el rango del filtro es inservible

**Lo que está bien:** 22.384 edades válidas de 24.203 (92,5 %), con una distribución perfectamente
sensata: 17 años (3.882), 16 (3.533), 18 (2.598), 15 (2.088). Eso es el perfil de JC.

**Lo que está mal:** 220 registros con basura de origen — gente que escribió mal la fecha en el
formulario. Hay nacimientos en 2026 (99 casos, escribieron la fecha del día), en 2025 (55) y uno
en 2908. Resultado: `edad` va de **-884 a 2022**, y el slider del filtro es inutilizable.

No es un problema de la migración: el cálculo desde `fecha_nacimiento` es correcto, la basura viene
del formulario. `edad_valida` ya los marca; lo que falla es que el panel no lo usa.

**Qué hacer:**

- El `min`/`max` del campo `edad` en el dataset se calcula **solo sobre las filas con
  `edad_valida = true`**. El slider debe ir de 10 a ~80, no de -884 a 2022.
- Las 220 inválidas entran en la categoría `sin_dato` del filtro, no en el rango numérico.
- El dato crudo se conserva: no se borra ni se corrige a mano. Son respuestas reales mal escritas.

---

## 2. Etiquetas y unidades

- `promedio_pct` se muestra como **"Promedio escolar"**.
- **Todas las estadísticas en porcentaje**, además del conteo absoluto: en las donas, en las barras
  y junto a cada opción de filtro. `1.234 (5,1 %)`.
- El CSV de exportación sale con encabezados legibles en la primera fila.

---

## 3. Campos técnicos: etiquetarlos o esconderlos

El grupo "Otros campos" vuelca columnas internas con su nombre crudo, y nadie puede saber qué
significan. Cada una necesita una etiqueta clara, o salir del panel de filtros:

| Campo | Qué es de verdad | Qué hacer |
|---|---|---|
| `enrutado_fuera_cobertura` | El formulario lo sacó del flujo por elegir una ciudad sin programa. 1.598 casos | Etiqueta: **"Quedó fuera por ciudad sin programa"** |
| `edad_valida` | Falso cuando la fecha de nacimiento da una edad imposible (fuera de 10–80). 220 casos | **Esconder del panel.** Es control de calidad interno |
| `edad_estado` | `valor` o `sin_dato`. Redundante con el filtro de edad, que ya ofrece "Sin dato" | **Esconder** |
| `promedio_escala` | La escala del promedio: 100 en CO/EC, **12 en Uruguay** | **Esconder**, pero mostrarla junto al valor en la ficha |
| `promedio_estado` | `valor` / `sin_dato` / `no_aplica` del promedio | **Esconder** |
| `nucleo_estado`, `indice_activos_estado` | Lo mismo para esos dos campos | **Esconder** |
| `nucleo_es_tope` | La persona respondió **"7 o más"**: el 7 es un tope, no un valor exacto | **Esconder**, pero que el filtro muestre "7 o más" en vez de "7" |
| `estrato_cat` | El estrato como categoría, con `no_aplica` para los 4.780 de fuera de Colombia | Es el que debe usar el filtro de estrato |
| `duplicado_de` | La misma persona envió el formulario dos veces; esta fila apunta a la que lleva la marca de seleccionada. 6 casos | Etiqueta: **"Envío duplicado"**, como sí/no |

**Regla:** si un campo existe para que el dato sea honesto pero no es una pregunta que alguien
quiera hacerse, no va en el panel de filtros.

### `indice_activos`, que Samuel preguntó qué es

Índice de 0 a 100 **construido por nosotros**, no una pregunta del formulario. Dos mitades de 50:

- **Elementos del hogar**, ponderados por valor: Nevera 1 · Estufa 1 · TV 1 · Lavadora 1,5 ·
  Horno 1,5 · Equipo de sonido 1 · Bicicleta 1 · Moto 2 · Carro 3
- **Servicios**: Energía, Agua, Gas, Alcantarillado, Recolección de basuras y Acceso pavimentado
  suman 1 cada uno; **Acceso no pavimentado resta 0,5**, porque es lo contrario de un activo

Es `no_aplica` en Uruguay 2025, cuyo formulario no preguntaba ni elementos ni servicios.

**Qué hacer:** que el panel explique esto en un tooltip sobre el campo. Un índice inventado por
nosotros que nadie puede auditar no sirve para decidir nada.

---

## 4. Esconder lo que está en cero

Dos niveles, y los dos se piden:

1. **Opciones en cero:** tras aplicar filtros, una opción cuyo conteo es 0 **no se muestra**.
2. **Cajas enteras:** si ningún valor de un campo tiene datos en el subconjunto vigente, la
   tarjeta del filtro **no se muestra**.

Caso que lo motiva: al mirar a quienes no quedaron seleccionados, las cajas de avance y cursos no
tienen nada que decir y solo estorban.

**Cuidado con esto:** `contarFacetas()` calcula sobre el universo filtrado por los *demás* filtros,
no por el propio. Así que una opción del **propio** campo nunca da 0 por estar deseleccionada.
Escóndelas por el conteo de faceta, **no** por el conteo del subconjunto final, o desaparecerán
opciones que el usuario necesita para ampliar su selección.

Y deja siempre una salida: si una caja se esconde, que siga accesible desde los chips de filtros
activos, o el usuario no podrá quitar un filtro que ya puso.

---

## 5. Datos de curso para los dos cánones

Hoy `pct_avance`, `cursos_inscritos` y `cursos_aprobados` están **vacíos: 0 de 832**. Los tres
filtros existen y no tienen un solo dato.

**Objetivo:** llenarlos para los matriculados de **2025 y 2026**, de modo que el panel pueda
responder no solo quién entró sino cómo le fue.

### Fuente

`panel-datos-rofe` (`PANEL_SUPABASE_*`, solo lectura): `aprobacion_cursos`, `participants`,
`cohorte_2026_ceds`, y las vistas de avance. El puente a cédula es `cohorte_2026_ceds` —
**`participants` no tiene columna `cedula`**.

### Cambios en la base

- Ampliar `resultado_programa` si hace falta: `cursos_inscritos`, `cursos_aprobados`, `pct_avance`
  ya existen; añadir `cohorte` para distinguir 2025 de 2026.
- Migración `005`, idempotente como las anteriores.
- Extender `cruzar_canon.py`, o un script nuevo, para traer el avance.

### Regla de honestidad

Para quien **no** entró al programa, estos campos son `no_aplica`, nunca 0. Un 0 en "cursos
aprobados" dice "entró y no aprobó ninguno", que de 23.371 personas es falso.

### Aceptación

- [ ] `pct_avance` y `cursos_aprobados` poblados para los matriculados de ambos cánones
- [ ] `no_aplica` para el resto, nunca 0
- [ ] Los tres filtros solo aparecen cuando hay matriculados en el subconjunto (§4)
- [ ] Un test nuevo en la suite: la suma de matriculados con avance == total de matriculados del canon

---

## 5-bis. DESBLOQUEADO — el roster 2025 y las métricas de curso existen

Codex frenó aquí con razón: no encontró cómo identificar el canon 2025 sin inventar, y paró en vez
de adivinar. La fuente existe, solo que en otra tabla. **Regla explícita, verificada el 2026-09-14
contra `panel-datos-rofe`:**

### El roster JC 2025 — 723 personas

```sql
-- egresados: 560 cédulas, ninguna nula
select cedula, participant_id from postulantes_jc
where promo_year = '2025' and rol = 'EGRESADO'

-- retirados: 163 cédulas
select cedula from retiros
where cohorte = '2025' and programa::text = 'jc'
```

**Los dos conjuntos son disjuntos (0 solapamiento) y su unión da 723.** Coincide con la cohorte
2025 sellada el 2026-08-06: 559 aprobados + 163 retirados. `rol` solo toma el valor `EGRESADO` en
`promo_year='2025'`, así que no hay ambigüedad.

**Por qué no servían las otras fuentes** (lo que Codex reportó, y es correcto): `participants` no
tiene `cohorte`, `cohorte_2026_ceds` solo cubre 2026, `v_cohorte_estudiantes` es agregada —7 filas,
una por año— y `aprobacion_cursos` solo tiene cohorte 2026. Ninguna sirve. `postulantes_jc` sí,
porque trae `promo_year`, `rol`, `cedula` **y** `participant_id`.

### Las métricas de curso — `participant_metrics`

```sql
select participant_id, total_cursos_inscrito, total_cursos_completado, porcentaje_promedio
from participant_metrics   -- 4.142 filas, una por persona
```

El puente es `postulantes_jc.participant_id`. **`participants` no tiene cédula**; `postulantes_jc`
es la única tabla que lleva las dos llaves.

### Cobertura real — y aquí está lo que no se puede inventar

| Grupo | Total | Con métricas | Sin métricas |
|---|---:|---:|---:|
| Egresados 2025 | 560 | **559** | 1 (sin `participant_id`) |
| Retirados 2025 | 163 | **0** | **163** |
| Canon 2026 | 832 | **776** | 56 |

**Los 163 retirados de 2025 no tienen datos de curso y nunca los van a tener.** Q10 borra el avance
al inhabilitar a un estudiante; el ledger es la única memoria y no cubre 2025. Eso no es un hueco
que se pueda rellenar: es información que ya no existe.

**Todos esos huecos son `sin_dato`, jamás 0.** Un 0 en "cursos aprobados" dice "entró y no aprobó
ninguno". Para un retirado de 2025 eso es probablemente falso, y para los 56 de 2026 es
seguramente falso: sus promedios son 11,9 cursos inscritos y 11,4 completados.

### Qué cargar

- `resultado_programa.cursos_inscritos` ← `total_cursos_inscrito`
- `resultado_programa.cursos_aprobados` ← `total_cursos_completado`
- `resultado_programa.pct_avance` ← `porcentaje_promedio`
- `resultado_programa.cohorte` ← `'2025'` o `'2026'`

Y **marcar como seleccionadas también las postulaciones de 2025** que crucen contra ese roster de
723: hoy `seleccionado` solo cubre el canon 2026. Ojo con el §9: el cruce de 2026 se acota a
postulaciones de 2026; el de 2025 debe acotarse a postulaciones de 2025, por la misma razón.

### Aceptación de 5-bis

- [ ] Roster 2025 identificado: 560 egresados + 163 retirados = 723, sin solapamiento
- [ ] `pct_avance` y `cursos_aprobados` poblados para 559 de 2025 y 776 de 2026
- [ ] `sin_dato` —no 0— para: el egresado sin `participant_id`, los 163 retirados de 2025 y los 56 de 2026
- [ ] `no_aplica` para las 23.371 postulaciones que nunca entraron al programa
- [ ] Un test en la suite que verifique esos conteos exactos

---

## 6. Aceptación de T12

- [ ] Slider de edad entre 10 y 80, no -884 a 2022
- [ ] Promedio etiquetado "Promedio escolar", y `no_aplica` en 2026 CO/EC/PA
- [ ] Porcentaje junto a cada conteo, en filtros y gráficos
- [ ] Campos técnicos etiquetados o escondidos según la tabla de §3
- [ ] Tooltip que explique el índice de activos
- [ ] Opciones en 0 escondidas; cajas sin datos escondidas; los chips siguen permitiendo quitar filtros
- [ ] Datos de curso cargados para 2025 y 2026, con `no_aplica` para el resto
- [ ] `npm run build` en verde y la suite de integridad completa
