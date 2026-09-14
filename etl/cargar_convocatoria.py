"""Carga idempotente del payload de convocatoria en Supabase.

No borra el universo principal. Las tablas multivalor sí se reemplazan, pero
solo para las postulaciones presentes en este payload.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import quote

import truststore
truststore.inject_into_ssl()
import requests

ROOT = Path(__file__).parent
OUT = ROOT / "salida"
BATCH = 500

MAIN_FIELDS = {
    "id_publico", "convocatoria", "pais", "fuente", "fila_origen", "enviado_en",
    "enrutado_fuera_cobertura", "ciudad_declarada", "ciudad_norm", "fecha_nacimiento",
    "edad", "edad_valida", "genero", "genero_texto_libre", "situacion_educativa",
    "anio_grado", "promedio_academico", "promedio_escala", "promedio_pct",
    "condicion_laboral", "emprendimiento", "otros_programas", "estrato", "ingreso_hogar",
    "personas_nucleo", "nucleo_es_tope", "tipo_vivienda", "tipo_vivienda_crudo",
    "indice_activos", "tiene_internet", "acceso_computador", "horas_semanales", "horas_min",
    "horas_max", "comodidad_autonomo", "nivel_software", "nivel_ingles", "codigo_embajador",
    "aplico_antes_jc", "fue_beneficiario_antes", "autorizo_datos",
}
MULTI = {
    "segmentos": "postulacion_segmentos",
    "ocupaciones": "postulacion_ocupaciones",
    "elementos": "postulacion_elementos",
    "servicios": "postulacion_servicios",
    "como_se_entero": "postulacion_como_se_entero",
}


def cargar_env_local() -> None:
    path = ROOT.parent / ".env.local"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"'))


class Supabase:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def request(self, method: str, table: str, **kwargs):
        headers = {**self.headers, **kwargs.pop("headers", {})}
        response = requests.request(method, f"{self.base}/{table}", timeout=180,
                                    headers=headers, **kwargs)
        if response.status_code >= 300:
            raise RuntimeError(f"{method} {table}: HTTP {response.status_code} {response.text[:500]}")
        return response

    def upsert(self, table: str, rows: list[dict], conflict: str) -> list[dict]:
        if not rows:
            return []
        response = self.request("POST", table,
                                params={"on_conflict": conflict},
                                headers={**self.headers,
                                         "Prefer": "resolution=merge-duplicates,return=representation"},
                                json=rows)
        return response.json() if response.content else []

    def existing_keys(self) -> set[tuple]:
        result: set[tuple] = set()
        offset = 0
        while True:
            response = self.request("GET", "postulaciones", params={
                "select": "convocatoria,pais,fuente,fila_origen",
                "order": "id", "limit": BATCH, "offset": offset,
            })
            page = response.json()
            result.update((x["convocatoria"], x["pais"], x["fuente"], x["fila_origen"]) for x in page)
            if len(page) < BATCH:
                return result
            offset += BATCH

    def count_rows(self) -> int:
        response = self.request("GET", "postulaciones", params={"select": "id", "limit": 0},
                                headers={"Prefer": "count=exact"})
        content_range = response.headers.get("content-range", "")
        return int(content_range.rsplit("/", 1)[1]) if "/" in content_range and content_range.rsplit("/", 1)[1] != "*" else -1

    def ids_for_keys(self, keys: list[tuple]) -> dict[tuple, str]:
        result = {}
        for batch_start in range(0, len(keys), BATCH):
            batch = keys[batch_start:batch_start + BATCH]
            # La consulta por llave compuesta no tiene una sintaxis segura para
            # listas arbitrarias; leer la tabla una vez evita offsets inestables.
            response = self.request("GET", "postulaciones", params={
                "select": "id,convocatoria,pais,fuente,fila_origen", "order": "id",
                "limit": BATCH, "offset": batch_start,
            })
            for x in response.json():
                result[(x["convocatoria"], x["pais"], x["fuente"], x["fila_origen"])] = x["id"]
        return result

    def delete_multi(self, table: str, ids: list[str]) -> None:
        for start in range(0, len(ids), BATCH):
            group = ids[start:start + BATCH]
            self.request("DELETE", table, params={"postulacion_id": f"in.({','.join(group)})"})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrada", type=Path, default=OUT / "payload.json")
    args = parser.parse_args()
    cargar_env_local()
    url = os.getenv("CONV_SUPABASE_URL")
    key = os.getenv("CONV_SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Faltan CONV_SUPABASE_URL o CONV_SUPABASE_SERVICE_ROLE_KEY")
    payload = json.loads(args.entrada.read_text(encoding="utf-8"))
    items = payload["postulaciones"]
    if len(items) != 24203:
        raise SystemExit(f"payload incompleto: {len(items)}")
    supa = Supabase(url, key)
    key_for = lambda item: (item["postulacion"]["convocatoria"], item["postulacion"]["pais"],
                             item["postulacion"]["fuente"], item["postulacion"]["fila_origen"])
    # Evita paginar una columna fuente larga cuando ya existe el universo
    # completo; en ese caso todas las llaves del payload son actualizaciones.
    before = ({key_for(x) for x in items} if supa.count_rows() == len(items)
              else supa.existing_keys())
    ids = {}
    inserted = updated = 0
    for start in range(0, len(items), BATCH):
        group = items[start:start + BATCH]
        rows = [{k: v for k, v in x["postulacion"].items() if k in MAIN_FIELDS} for x in group]
        returned = supa.upsert("postulaciones", rows, "convocatoria,pais,fuente,fila_origen")
        for x in returned:
            k = (x["convocatoria"], x["pais"], x["fuente"], x["fila_origen"])
            ids[k] = x["id"]
        for x in group:
            if key_for(x) in before:
                updated += 1
            else:
                inserted += 1
    if len(ids) != len(items):
        ids.update(supa.ids_for_keys([key_for(x) for x in items]))
    if len(ids) != len(items):
        raise RuntimeError(f"no se resolvieron IDs para todas las postulaciones: {len(ids)}/{len(items)}")
    print(f"postulaciones: insertadas={inserted} actualizadas={updated} omitidas=0")

    pii_rows = []
    for item in items:
        p = item["postulacion"]
        pii = dict(item["pii"])
        pii["postulacion_id"] = ids[key_for(item)]
        pii_rows.append(pii)
    for start in range(0, len(pii_rows), BATCH):
        supa.upsert("postulaciones_pii", pii_rows[start:start + BATCH], "postulacion_id")
    print(f"postulaciones_pii: insertadas/actualizadas={len(pii_rows)} omitidas=0")

    for payload_key, table in MULTI.items():
        all_ids = list(ids.values())
        supa.delete_multi(table, all_ids)
        rows = [{"postulacion_id": ids[key_for(item)], "valor": value}
                for item in items for value in item.get(payload_key, [])]
        for start in range(0, len(rows), BATCH):
            supa.upsert(table, rows[start:start + BATCH], "postulacion_id,valor")
        print(f"{table}: insertadas={len(rows)} actualizadas=0 omitidas=0")

    aliases = payload.get("valor_alias", [])
    for start in range(0, len(aliases), BATCH):
        supa.upsert("valor_alias", aliases[start:start + BATCH], "dominio,valor_crudo")
    print(f"valor_alias: insertadas/actualizadas={len(aliases)} omitidas=0")
    cities = payload.get("ciudad_alias", [])
    # La PK de T3 es ciudad_cruda. Si una grafía aparece en varios países, no
    # inventamos un país único: se conserva el alias con pais NULL y se reporta.
    by_raw = {}
    conflicts = 0
    for row in cities:
        old = by_raw.get(row["ciudad_cruda"])
        if old and old.get("pais") != row.get("pais"):
            conflicts += 1
            old["pais"] = None
        else:
            by_raw[row["ciudad_cruda"]] = dict(row)
    city_rows = list(by_raw.values())
    for start in range(0, len(city_rows), BATCH):
        supa.upsert("ciudad_alias", city_rows[start:start + BATCH], "ciudad_cruda")
    print(f"ciudad_alias: insertadas/actualizadas={len(city_rows)} omitidas={conflicts} conflictos_pais={conflicts}")

    fields = payload.get("campo_no_preguntado", [])
    for start in range(0, len(fields), BATCH):
        supa.upsert("campo_no_preguntado", fields[start:start + BATCH], "convocatoria,pais,campo")
    print(f"campo_no_preguntado: insertadas/actualizadas={len(fields)} omitidas=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
