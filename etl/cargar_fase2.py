"""Carga los resultados no-PII de la Fase 2 y eleva el alcance del proceso."""
from __future__ import annotations

import argparse
import csv
import os
from collections import defaultdict
from pathlib import Path

import truststore
truststore.inject_into_ssl()
import requests

from cargar_convocatoria import BATCH, Supabase, cargar_env_local
from cruzar_canon import cedula_norm

ROOT = Path(__file__).parent
DEFAULT_SOURCE = Path(r"C:\Users\EstudiantesJC\Downloads\2026-Fase2\Fase #2 Jóvenes creativos - Seguimiento.csv")
DUPLICATES = ROOT / "salida" / "fase2_duplicados_fuente.csv"

CITY_COUNTRY = {
    "Barranquilla": "CO", "Bogotá D.C.": "CO", "Cali": "CO",
    "Cartagena de Indias": "CO", "Medellín": "CO", "Guayaquil": "EC",
    "Quito": "EC", "Panamá": "PA", "Uruguay": "UY",
}
RANK = {"fase1": 0, "fase2": 1, "fase3": 2, "entrevista": 3,
        "seleccionado": 4, "matriculado": 5}


def parse_bool(value: str) -> bool:
    return str(value).strip().upper() == "COMPLETO"


def parse_int(value: str) -> int | None:
    value = str(value).strip()
    return int(value) if value else None


def parse_score(value: str) -> float | None:
    value = str(value).strip()
    if not value or value.casefold() == "sin responder":
        return None
    return float(value.rstrip("%").strip())


def read_source(path: Path) -> tuple[list[dict], dict[str, list[dict]]]:
    rows: list[dict] = []
    by_cedula: dict[str, list[dict]] = defaultdict(list)
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
        if header is None or len(header) != 29 or header[3] != "ID":
            raise RuntimeError("la estructura del CSV de Fase 2 no coincide con el contrato")
        for csv_row, row in enumerate(reader, start=2):
            if len(row) != len(header):
                raise RuntimeError(f"fila CSV con número de columnas inesperado: {csv_row}")
            city = row[0].strip()
            country = CITY_COUNTRY.get(city)
            if country is None:
                raise RuntimeError("hay una ciudad de Fase 2 fuera del diccionario auditado")
            cedula = cedula_norm(row[3])
            if not cedula:
                raise RuntimeError("hay un ID de Fase 2 vacío o no numérico")
            item = {
                "row": csv_row, "cedula": cedula, "pais": country,
                "prueba_completada": parse_bool(row[14]),
                "puntaje_prueba_pct": parse_score(row[15]),
                "formulario_completado": parse_bool(row[17]),
                "preguntas_respondidas": parse_int(row[22]),
                "respuestas_validas": parse_int(row[23]),
                "pasa_fase2": row[24].strip() == "1",
            }
            rows.append(item)
            by_cedula[cedula].append(item)
    return rows, by_cedula


def choose_sources(by_cedula: dict[str, list[dict]]) -> dict[str, dict]:
    chosen: dict[str, dict] = {}
    DUPLICATES.parent.mkdir(parents=True, exist_ok=True)
    with DUPLICATES.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["cedula_norm", "filas_fuente", "fila_elegida"])
        for cedula, candidates in sorted(by_cedula.items()):
            if len(candidates) > 1:
                eligible = [x for x in candidates if x["pasa_fase2"]] or candidates
                winner = max(eligible, key=lambda x: (x["puntaje_prueba_pct"] is not None,
                                                       x["puntaje_prueba_pct"] or -1,
                                                       x["row"]))
                writer.writerow([cedula, len(candidates), winner["row"]])
            else:
                winner = candidates[0]
            chosen[cedula] = winner
    return chosen


def fetch_all(api: Supabase, table: str, select: str, order: str = "id") -> list[dict]:
    result: list[dict] = []
    offset = 0
    while True:
        page = api.request("GET", table, params={
            "select": select, "order": order, "limit": BATCH, "offset": offset,
        }).json()
        result.extend(page)
        if len(page) < BATCH:
            return result
        offset += BATCH


def match_sources(api: Supabase, chosen: dict[str, dict]) -> tuple[list[dict], int]:
    posts = fetch_all(api, "postulaciones", "id,convocatoria,pais")
    pii = fetch_all(api, "postulaciones_pii", "postulacion_id,cedula_norm", "postulacion_id")
    post_by_id = {x["id"]: x for x in posts}
    candidates: dict[tuple[str, str], list[str]] = defaultdict(list)
    for item in pii:
        post = post_by_id.get(item["postulacion_id"])
        if post and post["convocatoria"] == "2026" and item.get("cedula_norm"):
            candidates[(post["pais"], cedula_norm(item["cedula_norm"]))].append(post["id"])
    matched: list[dict] = []
    unmatched = 0
    for cedula, source in chosen.items():
        ids = candidates.get((source["pais"], cedula), [])
        if len(ids) != 1:
            unmatched += 1
            continue
        matched.append({"postulacion_id": ids[0], **{k: source[k] for k in (
            "prueba_completada", "puntaje_prueba_pct", "formulario_completado",
            "preguntas_respondidas", "respuestas_validas", "pasa_fase2")}})
    return matched, unmatched


def duplicate_count(by_cedula: dict[str, list[dict]]) -> int:
    return sum(len(values) - 1 for values in by_cedula.values() if len(values) > 1)


def management_query(sql: str) -> None:
    url = os.environ["CONV_SUPABASE_URL"]
    ref = url.split("//", 1)[1].split(".", 1)[0]
    response = requests.post(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        headers={"Authorization": f"Bearer {os.environ['CONV_SUPABASE_ACCESS_TOKEN']}",
                 "Content-Type": "application/json"},
        json={"query": sql}, timeout=180,
    )
    if response.status_code >= 300:
        raise RuntimeError(f"actualización de fase2 rechazada: HTTP {response.status_code}")


def write_rows(api: Supabase, matched: list[dict]) -> None:
    for start in range(0, len(matched), BATCH):
        api.upsert("resultado_fase2", matched[start:start + BATCH], "postulacion_id")
    management_query("""
        update resultado_seleccion rs
        set fase_max_alcanzada = case
          when case rs.fase_max_alcanzada
            when 'fase1' then 0 when 'fase2' then 1 when 'fase3' then 2
            when 'entrevista' then 3 when 'seleccionado' then 4
            when 'matriculado' then 5 else 0 end < 1
          then 'fase2' else rs.fase_max_alcanzada
        end
        where exists (
          select 1 from resultado_fase2 rf
          where rf.postulacion_id = rs.postulacion_id
        )
    """)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrada", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--escribir", action="store_true")
    args = parser.parse_args()
    cargar_env_local()
    url = os.environ.get("CONV_SUPABASE_URL")
    key = os.environ.get("CONV_SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("faltan credenciales CONV_SUPABASE")
    rows, by_cedula = read_source(args.entrada)
    chosen = choose_sources(by_cedula)
    api = Supabase(url, key)
    matched, unmatched = match_sources(api, chosen)
    print(f"CSV filas: {len(rows)}")
    print(f"IDs únicos: {len(chosen)}")
    print(f"matchean: {len(matched)}")
    print(f"no matchean: {unmatched}")
    print(f"duplicados de fuente: {duplicate_count(by_cedula)}")
    if args.escribir:
        write_rows(api, matched)
        print(f"escritas resultado_fase2: {len(matched)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
