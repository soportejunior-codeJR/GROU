"""Carga la fila completa de cada formulario en postulaciones_respuestas.

El modo predeterminado valida todo el cruce y no escribe. ``--escribir`` solo
se permite después de que la validación completa haya terminado correctamente.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter
from pathlib import Path

from cargar_convocatoria import BATCH, Supabase, cargar_env_local
from normalizar_convocatoria import clave_pregunta

ROOT = Path(__file__).parent
OUT = ROOT / "salida"
WRITE_BATCH = 100
EXCLUIDAS = {"_fuente", "_fila", "_convocatoria", "_pais", "_pais_archivo"}
ESPERADAS = {
    "raw_2025_CO.jsonl": 7977,
    "raw_2025_CO-form1.jsonl": 90,
    "raw_2025_EC.jsonl": 2213,
    "raw_2025_UY.jsonl": 351,
    "raw_2026_CO.jsonl": 11356,
    "raw_2026_EC.jsonl": 1430,
    "raw_2026_PA.jsonl": 567,
    "raw_2026_UY.jsonl": 219,
}


def texto(value: object, fuente: str) -> str | None:
    if value is None or value == "":
        return None
    result = str(value)
    if "::" in fuente and re.fullmatch(r"\d+\.0", result):
        result = result[:-2]
    return result


def clave_fila(row: dict) -> tuple[str, str, str, int]:
    return (str(row["_convocatoria"]), str(row["_pais"]), str(row["_fuente"]), int(row["_fila"]))


def cargar_crudos() -> tuple[list[dict], Counter, set[str], int]:
    filas: list[dict] = []
    por_archivo: Counter = Counter()
    preguntas: set[str] = set()
    max_preguntas = 0
    paths = sorted(OUT.glob("raw_*.jsonl"))
    if {path.name for path in paths} != set(ESPERADAS):
        raise RuntimeError("el conjunto de archivos crudos no coincide con el esperado")
    for path in paths:
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                row = json.loads(line)
                filas.append(row)
                por_archivo[path.name] += 1
                question_keys = [key for key in row if key not in EXCLUIDAS]
                max_preguntas = max(max_preguntas, len(question_keys))
                preguntas.update(clave_pregunta(key) for key in question_keys)
    return filas, por_archivo, preguntas, max_preguntas


def preparar(filas: list[dict], por_archivo: Counter, supa: Supabase) -> tuple[list[dict], Counter, int, int]:
    total = sum(por_archivo.values())
    if total != 24203 or por_archivo != Counter(ESPERADAS):
        raise RuntimeError("los conteos de archivos crudos no coinciden con el contrato")

    postings: dict[tuple[str, str, str, int], str] = {}
    offset = 0
    while True:
        response = supa.request("GET", "postulaciones", params={
            "select": "id,convocatoria,pais,fuente,fila_origen",
            "order": "id", "limit": BATCH, "offset": offset,
        })
        page = response.json()
        for row in page:
            key = (str(row["convocatoria"]), str(row["pais"]), str(row["fuente"]), int(row["fila_origen"]))
            if key in postings:
                raise RuntimeError("hay llaves duplicadas en postulaciones")
            postings[key] = row["id"]
        if len(page) < BATCH:
            break
        offset += BATCH

    seen: set[tuple[str, str, str, int]] = set()
    rows: list[dict] = []
    source_counts: Counter = Counter()
    for row in filas:
        key = clave_fila(row)
        if key in seen:
            raise RuntimeError("hay una llave cruda repetida")
        seen.add(key)
        postulacion_id = postings.get(key)
        if postulacion_id is None:
            raise RuntimeError("hay una fila cruda sin postulacion correspondiente")
        source_counts[f"{key[0]}_{key[1]}"] += 1
        fuente = str(row["_fuente"])
        respuestas = [
            {"p": pregunta, "k": clave_pregunta(pregunta), "r": texto(row[pregunta], fuente)}
            for pregunta in row
            if pregunta not in EXCLUIDAS
        ]
        rows.append({"postulacion_id": postulacion_id, "respuestas": respuestas})

    if len(seen) != total or len(postings) != total:
        raise RuntimeError("el cruce no es uno a uno con postulaciones")
    if seen != set(postings):
        raise RuntimeError("hay postulaciones sin fila cruda correspondiente")
    return rows, source_counts, len(seen), max(len(row["respuestas"]) for row in rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--escribir", action="store_true")
    args = parser.parse_args()
    cargar_env_local()
    url = os.getenv("CONV_SUPABASE_URL")
    key = os.getenv("CONV_SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Faltan CONV_SUPABASE_URL o CONV_SUPABASE_SERVICE_ROLE_KEY")
    filas, por_archivo, preguntas, max_preguntas = cargar_crudos()
    rows, _source_counts, total, max_respuestas = preparar(filas, por_archivo, Supabase(url, key))
    for nombre in ESPERADAS:
        print(f"{nombre}: {por_archivo[nombre]}")
    print(f"total: {total}")
    print(f"preguntas_distintas: {len(preguntas)}")
    print(f"max_preguntas: {max(max_preguntas, max_respuestas)}")
    if len(preguntas) != 95 or max(max_preguntas, max_respuestas) != 53:
        raise SystemExit(1)
    if args.escribir:
        supa = Supabase(url, key)
        for start in range(0, len(rows), WRITE_BATCH):
            supa.request("POST", "postulaciones_respuestas",
                         params={"on_conflict": "postulacion_id"},
                         headers={**supa.headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
                         json=rows[start:start + WRITE_BATCH])
        print(f"escritas: {len(rows)}")
    else:
        print("modo: dry-run")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
