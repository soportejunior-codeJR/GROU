# GROU

Panel de convocatoria de Jovenes creaTIvos: Explorador y Distribuciones con filtros en cascada
sobre el universo completo de postulantes de 4 paises y 2 convocatorias (24.203 filas de formulario).

La beta incluye gráficos interactivos que filtran, comparación de seleccionadas contra no
seleccionadas e informe imprimible con el estado de los filtros. El Embudo no se construyó:
las fuentes de las fases posteriores no están disponibles y mostrarlo insinuaría datos que no
podemos respaldar.

Proyecto completo — **back y front**. La base de datos es lo que hace posible cada consulta;
el panel es la ultima capa.

```
GROU/
├── etl/      Python. Extrae, normaliza, carga y cruza. Define el esquema de la base.
└── web/      Next.js. Lee una vista y filtra en el navegador. Deploy en Vercel.
```

## El principio que define todo lo demas

**El universo son las 24.203 filas de formulario, no los 832 matriculados.**

`seleccionado` es un atributo filtrable como el estrato o la ciudad: sirve para partir la
poblacion en dos, nunca para recortarla y nunca como denominador de un porcentaje. De ahi salen
tres reglas que atraviesan el codigo entero:

1. **Ninguna fila se descarta.** Ni por cedula invalida, ni duplicada, ni sin match, ni enrutada
   fuera de cobertura. Se marca, no se borra. Un script que "limpia" filas esta mal escrito.
2. **`Sin dato` es una categoria visible y contable.** Toda segmentacion tiene que sumar
   exactamente el universo vigente. Si un nulo se cae de una faceta, los segmentos dejan de sumar
   N y el conteo miente por omision.
3. **`Sin dato` no es `No aplica`.** "No contesto" y "nunca se le pregunto" son cosas distintas:
   el estrato fuera de Colombia, el nivel de ingles y el indice de activos en Uruguay 2025 nunca
   se preguntaron. Mezclarlos inventaria un dato faltante donde solo hubo otro formulario.

## Es un proyecto internacional

`pais` es columna de primer nivel (CO / EC / UY / PA) y el modelo asume que los paises no son
intercambiables:

| Situacion | Como se trata |
|---|---|
| El estrato solo existe en Colombia | `No aplica` fuera de CO, jamas 0 ni vacio ambiguo |
| Uruguay califica de 1 a 12 y Colombia/Ecuador de 1 a 100 | `promedio_pct` normalizado, para que el filtro compare lo mismo |
| Panama solo participo en 2026 | La vista de cobertura lo muestra; no se rellena hacia atras |
| Uruguay 2025 no preguntaba 8 campos | `No aplica`, con la cobertura visible por campo y pais |
| 191 formas de escribir la ciudad | Tabla `ciudad_alias`, que ademas carga el pais |

`v_cobertura_campos` existe justamente para esto: muestra el % de respuesta por campo y por
pais, para que nadie lea un hueco de formulario como un cero.

## Privacidad

La base guarda datos personales de ~21.400 personas, muchas menores de edad.

- La PII vive en una tabla aparte que solo toca `service_role`, con RLS deny-all.
- La vista que consume el panel **no expone un solo campo identificable**: ni nombre, ni correo,
  ni telefono, ni documento, ni direccion, ni institucion educativa.
- El acceso es por lista blanca de correos, validada en el cliente y otra vez en el servidor.
- `web/data/postulaciones.json` esta en `.gitignore` a proposito: son microdatos y se regeneran
  en cada build.

## Arrancar

```bash
# ETL
cp .env.local.example .env.local        # llenar
python etl/extraer_convocatoria.py

# Web
cd web
npm install
cp .env.local.example .env.local        # llenar
npm run dataset                          # genera data/postulaciones.json
npm run dev
```

Después de cada cambio de configuración de Vercel, verifica el acceso externo con:

```bash
cd web
npm run verificar-acceso
```

El verificador usa cabeceras limpias, sin cookies ni credenciales, y distingue la protección de
Vercel del login de la aplicación.

Sin credenciales el panel igual arranca: usa `web/data/postulaciones.ejemplo.json` y lo avisa
en pantalla.

## Deploy

Vercel, **Root Directory = `web`**. Las 4 variables de `web/.env.local.example` van como
Environment Variables del proyecto. La `SERVICE_ROLE_KEY` nunca con prefijo `NEXT_PUBLIC_`.

## Documentacion

El plan, la auditoria de fuentes y el contrato de las 9 tareas viven en el repo `admin-usable`
(vault de Obsidian del equipo):

- `docs/procesos/panel-convocatoria-jc.md` — fuentes auditadas, decisiones, gotchas, riesgos
- `docs/procesos/panel-convocatoria-jc-spec-codex.md` — las 9 tareas, con criterio de aceptacion

## Acabado visual T19

La beta usa Inter autoalojada, fondo estático con la paleta ROFÉ y el logo oficial. La fecha de
envío se explora como una onda por convocatoria, con atajos, rango y arrastre; sus filtros siguen
siendo índices categóricos y conservan la URL, los chips y el CSV. Los gráficos muestran etiquetas
de valor y el informe imprimible mantiene fondo blanco y gráficos vectoriales.
