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
   canónicas — `0952527794`, `0952900447`, `1752130409 0`, `4835951 0`, `507 0`, `5 0`. Van a
   `sin_dato` con la misma regla. Criterio: si al quitar dígitos y signos quedan 1 letra o menos,
   no es una ciudad.
   (De paso, `1752130409 0` delata que ese valor entró como float `1752130409.0` — vale la pena
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

| Cédula | Postulaciones | Ciudad |
|---|---|---|
| 1025660370 | id 20390 (10-feb) · id 21860 (15-feb) | Medellín |
| 1028885979 | id 16759 (28-ene) · id 21466 (13-feb) | Bogotá D.C. |
| 1094050605 | id 21243 · id 21246 (ambas 12-feb) | Bogotá D.C. |
| 1141115465 | id 11966 (26-ene) · id 20724 (11-feb) | Bogotá D.C. |
| 1143954132 | id 11509 (23-ene) · id 21877 (15-feb) | Cali |

**Regla:** `seleccionado = true` va en la **más reciente por `enviado_en`**; en empate, la de
**mayor `id_publico`** (caso 1094050605, ambas del 12-feb). Las demás quedan `seleccionado = false`
y con `duplicado_de = id_publico` de la elegida.

Ninguna fila se descarta — se marca, como manda la regla 2 del §3. Y así el test 7 sigue dando
exactamente 832.

### Regla 2 — la ambigüedad por nombre

Un solo caso, ya acotado a 2026:

```
canon: cedula 57951440  'Navarro Alvarez Rodrigo'
  id 23989  cedula 57951430  2025-11-26  Paysandú  (UY, convocatoria 2026)
  id 24012  cedula 56951430  2025-12-05  Paysandú  (UY, convocatoria 2026)
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
10. Ninguna ciudad con cobertura tiene filas `enrutado_fuera_cobertura`
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

Hoy es un cascarón. Lo que **ya existe y no hay que reescribir**:

| Archivo | Qué resuelve |
|---|---|
| `web/lib/dataset.ts` | Contrato del formato columnar + `filtrar()` y `contarFacetas()` |
| `web/lib/auth.ts` + `auth.config.ts` | Login con Google, lista blanca, cliente perezoso |
| `web/app/api/datos/route.ts` | Valida token y correo del lado del servidor antes de servir |
| `web/scripts/construir-dataset.mjs` | Hornea el dataset en el build |

**El conteo de facetas es el corazón del pedido y se hace mal por defecto.** El número que se
muestra junto a cada opción de un filtro se calcula sobre el universo filtrado por **todos los demás
filtros excepto el propio** — para eso existe el parámetro `omitir` de `filtrar()`. Así el usuario ve
cuánto sumaría cada opción *antes* de marcarla, y una que quedaría en cero se ve en cero en vez de
desaparecer. Filtrar sobre el universo ya reducido por el propio filtro es otra cosa.
**Usa `contarFacetas()`, no recuentes a mano.**

Requisitos explícitos del cliente:

- Dos modos: `TODAS` (cumple todos los filtros) y `AL_MENOS_UNA` (cumple al menos uno)
- Encabezado permanente: `N de 24.203 postulaciones · M seleccionadas · X %`. El `X %` es **M sobre
  N**, nunca sobre 832. Todo porcentaje declara su base en pantalla
- `Sin dato` aparece como opción más en cada filtro, con su conteo, y se puede filtrar por ella
- Chips de filtros activos, removibles, más un "limpiar todo"
- Rangos numéricos con slider doble; categóricos con multiselección y buscador
- **URL sincronizada con los filtros**, para compartir un hallazgo pegando el enlace
- Exportar el subconjunto filtrado a CSV, **sin PII**, con `id_publico` como identificador

Tres vistas: **Explorador** (filtros + conteo + tabla), **Distribuciones** (histogramas,
seleccionados vs. no seleccionados lado a lado — es lo que responde "identificar patrones") y
**Embudo** (postularon → matriculados por ciudad, con los estados faltantes marcados como "sin
fuente"; **no dibujes un embudo completo que insinúe datos que no tenemos**).

Estilo visual: mínimo funcional. Se define después de la beta.

**Gotcha ya pagado:** no crees el cliente de Supabase al cargar el módulo. `createClient` lanza
`supabaseUrl is required` con variables vacías, y en el prerender del build lo están — tumba
`next build` entero. Va perezoso, como en `clienteAuth()`.

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
