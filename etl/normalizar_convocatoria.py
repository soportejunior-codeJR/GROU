"""Normaliza el JSONL de convocatoria a un payload idempotente y auditable.

La normalizacion es deliberadamente conservadora: un valor que no se reconoce queda NULL,
se agrega a valor_alias y se informa. El payload contiene PII solo en etl/salida (gitignored).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

ROOT = Path(__file__).parent
OUT = ROOT / "salida"
CAMPOS_CATEGORICOS = {
    "genero", "situacion_educativa", "condicion_laboral", "emprendimiento", "otros_programas",
    "ingreso_hogar", "tipo_vivienda", "acceso_computador", "horas_semanales",
    "comodidad_autonomo", "nivel_software", "nivel_ingles",
}
NO_PREGUNTADOS = {("2025", "UY", c) for c in
                  ("tipo_vivienda", "personas_nucleo", "indice_activos", "nivel_ingles", "nivel_software")}
_KEY_CACHE: dict[int, list[tuple[str, str]]] = {}


def normalizar_texto(value: object) -> str:
    s = "" if value is None else str(value).strip().lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()


def plegar_ciudad(value: object) -> str:
    """Clave comparable para texto libre de ciudad, sin alterar el valor crudo."""
    s = "" if value is None else unicodedata.normalize("NFKC", str(value)).strip().lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def clave_pregunta(value: object) -> str:
    return normalizar_texto(value)


def limpio(value: object) -> str | None:
    s = "" if value is None else str(value).strip()
    return s or None


def buscar(row: dict, *partes: str) -> str | None:
    row_id = id(row)
    keys = _KEY_CACHE.get(row_id)
    if keys is None:
        keys = [(k, clave_pregunta(k)) for k in row if not k.startswith("_")]
        _KEY_CACHE[row_id] = keys
    for parte in partes:
        needle = normalizar_texto(parte)
        for original, normalized in keys:
            if needle in normalized:
                return limpio(row.get(original))
    return None


def cedula(value: object) -> tuple[str | None, str | None, bool]:
    raw = limpio(value)
    if not raw:
        return None, raw, True
    # Excel puede representar los identificadores como float, con un '.0' al final.
    raw = re.sub(r"\.0$", "", raw)
    digits = re.sub(r"\D", "", raw)
    normalized = digits.lstrip("0") or None
    return normalized, raw, normalized is None


def nombre_norm(nombres: str | None, apellidos: str | None) -> str | None:
    text = normalizar_texto(f"{nombres or ''} {apellidos or ''}")
    return " ".join(sorted(text.split())) or None


def fecha(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip().replace(".0", "")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            candidate = text[:19] if "%H" in fmt else text.split()[0]
            return datetime.strptime(candidate, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def edad(fecha_nacimiento: str | None, cierre: date) -> int | None:
    if not fecha_nacimiento:
        return None
    try:
        nacimiento = date.fromisoformat(fecha_nacimiento)
    except ValueError:
        return None
    return cierre.year - nacimiento.year - ((cierre.month, cierre.day) < (nacimiento.month, nacimiento.day))


def booleano(raw: str | None) -> bool | None:
    if raw is None:
        return None
    v = normalizar_texto(raw)
    if v.startswith("si") or v in {"s", "true", "1"}:
        return True
    if v.startswith("no") or v in {"n", "false", "0"}:
        return False
    return None


def dominio(raw: str | None, mapping: dict[str, str], aliases: list, dom: str, stats: Counter) -> str | None:
    if raw is None:
        return None
    key = normalizar_texto(raw)
    value = mapping.get(key)
    if value is None:
        # Las respuestas de Forms incluyen explicaciones largas. Solo aceptamos
        # una coincidencia explícita de una frase catalogada, nunca una inferencia.
        candidatos = [v for k, v in mapping.items() if k in key]
        if len(set(candidatos)) == 1:
            value = candidatos[0]
    if value is None:
        aliases.append({"dominio": dom, "valor_crudo": raw, "valor_canonico": None,
                        "n_ocurrencias": 1, "revisado": False})
        stats[f"{dom}:sin_mapeo"] += 1
    else:
        stats[f"{dom}:{value}"] += 1
    return value


def multivalor(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [normalizar_texto(x) for x in re.split(r",|;", raw) if normalizar_texto(x)]


def activos(raw: str | None, weights: dict[str, float], maximum: float) -> float | None:
    values = multivalor(raw)
    if not values:
        return None
    score = sum(weight for label, weight in weights.items() if normalizar_texto(label) in values)
    return round(score / maximum * 50)


def normalizar_fila(row: dict, aliases: list, stats: Counter) -> dict:
    convocatoria = row["_convocatoria"]
    pais = row["_pais"]
    cierre = date(2026, 2, 16) if convocatoria == "2026" else date(2025, 2, 17)
    nombres = buscar(row, "nombres")
    apellidos = buscar(row, "apellidos")
    cedula_cruda = buscar(row, "numero de identificacion", "cedula")
    cedula_norm, cedula_original, cedula_invalida = cedula(cedula_cruda)
    nacimiento = fecha(buscar(row, "fecha de nacimiento"))
    horas = buscar(row, "cuantas horas semanales")
    hkey = normalizar_texto(horas)
    hmap = {"menos de 5 horas": (0, 5), "entre 5 y 10 horas": (5, 10),
            "entre 10 y 15 horas": (10, 15), "mas de 15 horas": (15, None),
            "5 10": (5, 10), "10 15": (10, 15), "15": (15, None)}
    hmin, hmax = hmap.get(hkey, (None, None))
    personas_raw = buscar(row, "cuantas personas conforman tu nucleo", "personas conforman tu nucleo")
    personas = None
    tope = False
    if personas_raw:
        if normalizar_texto(personas_raw) == "7 o mas":
            personas, tope = 7, True
        else:
            m = re.search(r"\d+", personas_raw)
            personas = int(m.group()) if m else None
    promedio_raw = buscar(row, "promedio academico", "promedio acumulado", "promedio")
    promedio = None
    if promedio_raw:
        m = re.search(r"-?\d+(?:[.,]\d+)?", promedio_raw.replace(".", "."))
        try:
            promedio = float(m.group().replace(",", ".")) if m else None
        except ValueError:
            promedio = None
    escala = 12 if pais == "UY" else 100
    if promedio is not None and not 0 <= promedio <= escala:
        # La fuente contiene entradas fuera de la escala declarada (por ejemplo,
        # 700 en una escala 1--100). No se corrige dividiendo ni se adivina la
        # intención: queda NULL y se contabiliza para auditoría.
        stats["promedio:fuera_de_escala"] += 1
        promedio = None
    grado_raw = buscar(row, "grado que estas cursando", "grado que cursas", "grado cursando")
    grado_key = normalizar_texto(grado_raw)
    situacion = None
    anio_grado = None
    if grado_raw:
        if "bachiller" in grado_key:
            situacion = "bachiller"
        else:
            m = re.search(r"\b(10|11|[1-6])\b", grado_key)
            situacion = f"grado_{m.group(1)}" if m else "otro"
    anio_raw = buscar(row, "anio en el que terminaste", "ano en el que terminaste")
    if anio_raw:
        m = re.search(r"\b(19|20)\d{2}\b", anio_raw)
        anio_grado = int(m.group()) if m else None
    condicion_raw = buscar(row, "condiciones laborales")
    condicion_key = normalizar_texto(condicion_raw)
    condicion = None
    if condicion_key:
        tiempo = "completo" if "tiempo completo" in condicion_key else "parcial" if "tiempo parcial" in condicion_key else None
        formal = "formal" if "contrato formal" in condicion_key else "informal" if "sin contrato" in condicion_key else None
        condicion = f"{tiempo}_{formal}" if tiempo and formal else None
    otros = buscar(row, "postulado recientemente a otros programas")
    otros_key = normalizar_texto(otros or "")
    otros_valor = ("no" if otros_key.startswith("no") else "espera" if "esperando" in otros_key
                   else "rechazado" if "no fui aceptado" in otros_key
                   else "aceptado" if "ya fui aceptado" in otros_key else None)
    ciudad_raw = buscar(row, "ciudad donde vives", "ciudad o poblacion de residencia", "ciudad de residencia", "ciudad")
    ciudad_key = plegar_ciudad(ciudad_raw)
    # Las etiquetas mostrables conservan el nombre conocido; el resto usa la clave
    # plegada para que Quito/Paysandu/Duran no se separen por ortografía.
    ciudades_fijas = {"bogota": "Bogotá D.C.", "bogota d c": "Bogotá D.C.", "medellin": "Medellín",
                      "cali": "Cali", "cartagena": "Cartagena de Indias", "cartagena de indias": "Cartagena de Indias",
                      "barranquilla": "Barranquilla", "valle de aburra": "Valle de Aburrá", "guayaquil": "Guayaquil",
                      "quito": "Quito", "paysandu": "Paysandú", "panama": "Panamá", "ciudad de panama": "Panamá"}
    no_ciudades = {"colombia", "ecuador", "ciudad"}
    # Seis respuestas contienen una cédula/teléfono (a veces embebido en texto)
    # en lugar de una ciudad. No se intenta extraer ni adivinar una ciudad.
    ciudad_no_es_ciudad = ciudad_key in no_ciudades or bool(re.search(r"\d{7,}", ciudad_key))
    if ciudad_no_es_ciudad or not ciudad_key:
        ciudad_norm = "sin_dato"
    elif ciudad_key == "ciudad de panama":
        ciudad_norm = "Panamá"
    elif ciudad_key == "panama":
        ciudad_norm = "Panamá"
    elif ciudad_key.startswith("guayaquil "):
        ciudad_norm = "Guayaquil"
    elif ciudad_key.startswith("valle de aburra "):
        ciudad_norm = "Valle de Aburrá"
    elif ciudad_key.startswith("bogota "):
        ciudad_norm = "Bogotá D.C."
    elif ciudad_key.startswith("medellin "):
        ciudad_norm = "Medellín"
    elif ciudad_key.startswith("cartagena "):
        ciudad_norm = "Cartagena de Indias"
    elif ciudad_key.startswith("barranquilla "):
        ciudad_norm = "Barranquilla"
    elif ciudad_key.startswith("cali "):
        ciudad_norm = "Cali"
    else:
        ciudad_norm = next((v for k, v in ciudades_fijas.items() if k == ciudad_key), ciudad_key)
    fuera = (convocatoria == "2025" and pais in {"CO", "EC"}
             and sum(1 for k, v in row.items() if not k.startswith("_") and limpio(v)) <= 2)
    post = {
        "id_publico": 0, "convocatoria": convocatoria, "pais": pais,
        "fuente": row["_fuente"], "fila_origen": int(row["_fila"]),
        "enviado_en": fecha(buscar(row, "marca temporal")),
        "enrutado_fuera_cobertura": fuera,
        "formulario_incompleto": convocatoria == "2025" and pais == "UY" and not ciudad_raw,
        "ciudad_no_es_ciudad": ciudad_no_es_ciudad,
        "ciudad_declarada": ciudad_raw,
        "ciudad_norm": ciudad_norm,
        "fecha_nacimiento": nacimiento, "edad": edad(nacimiento, cierre),
        "edad_valida": None if nacimiento is None else 10 <= edad(nacimiento, cierre) <= 80,
        "genero": dominio(buscar(row, "como te identificas", "genero"),
                           {"femenino": "femenino", "masculino": "masculino", "no binario": "no_binario",
                            "otro": "otro", "prefiero no decirlo": "no_responde"}, aliases, "genero", stats),
        "genero_texto_libre": None,
        "situacion_educativa": situacion, "anio_grado": anio_grado,
        "promedio_academico": promedio, "promedio_escala": escala,
        "promedio_pct": round(promedio / escala * 100, 1) if promedio is not None else None,
        "condicion_laboral": condicion,
        "emprendimiento": dominio(buscar(row, "emprendimiento o proyecto"),
            {"si estoy trabajando en un emprendimiento proyecto": "si",
             "no pero estoy considerando iniciar uno": "considera",
             "no no tengo un emprendimiento": "no"}, aliases, "emprendimiento", stats),
        "otros_programas": otros_valor, "estrato": None,
        "ingreso_hogar": dominio(buscar(row, "ingreso total en tu hogar"),
            {"menor a un salario minimo": "<1smmlv", "entre 1 y 2 salarios minimos": "1-2smmlv",
             "mayor a 2 salarios minimos": ">2smmlv"}, aliases, "ingreso_hogar", stats),
        "personas_nucleo": personas, "nucleo_es_tope": tope,
        "tipo_vivienda": dominio(buscar(row, "tipo de tenencia", "vivienda"),
            {"arrendada": "arrendada", "familiar": "familiar", "propia": "propia",
             "compartida": "compartida"}, aliases, "tipo_vivienda", stats),
        "tipo_vivienda_crudo": buscar(row, "tipo de tenencia", "vivienda"),
        "indice_activos": None,
        "tiene_internet": booleano(buscar(row, "tienes acceso a internet")),
        "acceso_computador": dominio(buscar(row, "acceso a un computador"),
            {"si tengo un computador personal": "propio", "no tengo pero puedo acceder o pedir prestado uno": "prestado",
             "no tengo acceso a un computador": "ninguno"}, aliases, "acceso_computador", stats),
        "horas_semanales": horas, "horas_min": hmin, "horas_max": hmax,
        "comodidad_autonomo": dominio(buscar(row, "comod aprendiendo", "sientes comodo", "manera autonoma"),
            {"si me adapto bien": "alta", "tengo algo de experiencia": "media",
             "no me siento comodo": "baja"}, aliases, "comodidad_autonomo", stats),
        "nivel_software": dominio(buscar(row, "nivel de conocimiento en desarrollo"),
            {"ninguno": "ninguno", "basico": "basico", "medio": "medio", "avanzado": "avanzado"}, aliases, "nivel_software", stats),
        "nivel_ingles": dominio(buscar(row, "nivel de ingles"),
            {"no hablo ingles": "no_habla", "principiante": "principiante", "intermedio": "intermedio",
             "avanzado": "avanzado", "nativo": "nativo"}, aliases, "nivel_ingles", stats),
        "codigo_embajador": buscar(row, "nombre o codigo del embajador"),
        "aplico_antes_jc": booleano(buscar(row, "he aplicado antes")),
        "fue_beneficiario_antes": booleano(buscar(row, "fui beneficiario")),
        "autorizo_datos": booleano(buscar(row, "he leido y acepto", "autorizacion de uso")),
    }
    if pais != "CO":
        post["estrato"] = None
    else:
        raw_estrato = buscar(row, "estrato")
        post["estrato"] = int(float(raw_estrato)) if raw_estrato and re.fullmatch(r"\d+(?:\.0)?", raw_estrato) and 1 <= int(float(raw_estrato)) <= 6 else None
    if convocatoria == "2025" and pais == "UY":
        post["indice_activos"] = None
    else:
        post["indice_activos"] = activos(buscar(row, "elementos que tienes"),
            {"nevera": 1, "estufa": 1, "tv": 1, "lavadora": 1.5, "horno": 1.5,
             "equipo de sonido": 1, "bicicleta": 1, "moto": 2, "carro": 3}, 13)
        services = activos(buscar(row, "servicios con los que"),
            {"energia": 1, "agua": 1, "gas": 1, "alcantarillado": 1, "recoleccion de basuras": 1,
             "acceso pavimentado": 1, "acceso no pavimentado": -0.5}, 6)
        if post["indice_activos"] is not None and services is not None:
            post["indice_activos"] = post["indice_activos"] + services
    pii = {"postulacion_id": None, "cedula_tipo": buscar(row, "tipo de identificacion"),
           "cedula_cruda": cedula_original, "cedula_norm": cedula_norm, "cedula_invalida": cedula_invalida,
           "nombres": nombres, "apellidos": apellidos, "nombre_norm": nombre_norm(nombres, apellidos),
           "email": buscar(row, "correo electronico", "correo"), "celular": buscar(row, "numero de whatsapp", "numero de telefono"),
           "celular_alterno": buscar(row, "numero alterno"), "direccion": buscar(row, "direccion residencial"),
           "barrio": buscar(row, "barrio"), "comuna": buscar(row, "comuna"),
           "institucion_educativa": buscar(row, "institucion educativa"), "acudiente_nombre": buscar(row, "nombres", "acudiente"),
           "acudiente_email": buscar(row, "correo electronico", "acudiente"), "acudiente_telefono": None, "acudiente_relacion": None}
    return {"postulacion": post, "pii": pii,
            "segmentos": multivalor(buscar(row, "segmento poblacional")),
            "ocupaciones": multivalor(buscar(row, "ocupacion actual")),
            "elementos": multivalor(buscar(row, "elementos que tienes")),
            "servicios": multivalor(buscar(row, "servicios con los que")),
            "como_se_entero": multivalor(buscar(row, "como te enteraste"))}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrada", type=Path, default=OUT)
    parser.add_argument("--salida", type=Path, default=OUT / "payload.json")
    args = parser.parse_args()
    aliases: list[dict] = []
    stats = Counter()
    filas = []
    for path in sorted(args.entrada.glob("raw_*.jsonl")):
        with path.open(encoding="utf-8") as fh:
            filas.extend(json.loads(line) for line in fh if line.strip())
    filas.sort(key=lambda r: (r["_convocatoria"], r["_pais"], r.get("Marca temporal", ""), int(r["_fila"])))
    payload = [normalizar_fila(row, aliases, stats) for row in filas]
    for i, item in enumerate(payload, 1):
        item["postulacion"]["id_publico"] = i
    # Dedupe aliases while retaining occurrence counts.
    dedup: dict[tuple, dict] = {}
    for alias in aliases:
        key = (alias["dominio"], alias["valor_crudo"])
        if key in dedup:
            dedup[key]["n_ocurrencias"] += 1
        else:
            dedup[key] = alias
    city_aliases = {}
    for item in payload:
        p = item["postulacion"]
        raw = p.get("ciudad_declarada")
        if raw:
            key = (raw, p["pais"])
            city_aliases[key] = {"ciudad_cruda": raw, "ciudad_norm": p["ciudad_norm"],
                                 "pais": p["pais"], "tiene_cobertura": p["ciudad_norm"] in
                                 {"Barranquilla", "Bogotá D.C.", "Cali", "Cartagena de Indias", "Medellín", "Valle de Aburrá", "Guayaquil"}}
    result = {"version": 1, "total": len(payload), "postulaciones": payload,
              "ciudad_alias": list(city_aliases.values()),
              "valor_alias": list(dedup.values()),
              "campo_no_preguntado": [{"convocatoria": c, "pais": p, "campo": f} for c, p, f in sorted(NO_PREGUNTADOS)],
              "metadatos": {"regla_id_publico": "orden (convocatoria,pais,marca_temporal,_fila)",
                             "generado_en": datetime.now().astimezone().isoformat()}}
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    sin_mapear = args.salida.parent / "preguntas_sin_mapear.txt"
    known = {"_fuente", "_fila", "_convocatoria", "_pais", "_pais_archivo"}
    counts = Counter()
    for row in filas:
        for key, value in row.items():
            if key not in known and limpio(value):
                counts[clave_pregunta(key)] += 1
    sin_mapear.write_text("\n".join(f"{n}\t{key}" for key, n in counts.most_common()), encoding="utf-8")
    # La cola se define sobre el texto declarado, no sobre la categoría canónica:
    # conserva exactamente las grafías que alguien debe revisar a ojo y no pierde
    # las variantes que el plegado haya unido.
    ciudad_rows = [x["postulacion"] for x in payload
                   if not x["postulacion"].get("enrutado_fuera_cobertura")
                   and x["postulacion"].get("ciudad_declarada")
                   and not x["postulacion"].get("ciudad_no_es_ciudad")]
    ciudad_counts = Counter(x["ciudad_declarada"] for x in ciudad_rows)
    with (args.salida.parent / "ciudades_cola_larga.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["ciudad_cruda", "ciudad_norm", "filas"])
        writer.writerows(sorted(((name, next(x["ciudad_norm"] for x in ciudad_rows
                                               if x["ciudad_declarada"] == name), n)
                                for name, n in ciudad_counts.items() if n == 1),
                               key=lambda x: x[0]))
    print(f"OK payload.json: {len(payload)} registros")
    print(f"Preguntas sin mapear registradas: {sin_mapear}")
    for key, n in sorted(stats.items()):
        print(f"DOMINIO {key}={n}")
    print(f"ALIAS valor_alias={len(dedup)}")
    print(f"ALIAS ciudad_alias={len(city_aliases)} · cola_singletons={sum(n == 1 for n in ciudad_counts.values())}")
    return 0 if len(payload) == 24203 else 1


if __name__ == "__main__":
    raise SystemExit(main())
