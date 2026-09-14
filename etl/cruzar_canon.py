"""Cruza la cohorte JC 2026 contra postulaciones 2026 y pega el resultado al universo."""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import truststore
truststore.inject_into_ssl()
import requests

ROOT = Path(__file__).parent
OUT = ROOT / "salida"
BATCH = 500


def cargar_env_local():
    for line in (ROOT.parent / ".env.local").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"'))


def cedula_norm(value):
    return re.sub(r"\D", "", str(value or "")).lstrip("0") or None


def nombre_norm(value):
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(sorted(re.sub(r"[^a-z ]", " ", text).split())) or None


class Supa:
    def __init__(self, url, key):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def request(self, method, table, **kwargs):
        headers = {**self.headers, **kwargs.pop("headers", {})}
        response = requests.request(method, f"{self.base}/{table}", headers=headers,
                                    timeout=180, **kwargs)
        if response.status_code >= 300:
            raise RuntimeError(f"{method} {table}: HTTP {response.status_code} {response.text[:500]}")
        return response

    def get_all(self, table, select="*", order="id", extra=None):
        result, offset = [], 0
        while True:
            params = {"select": select, "order": order, "limit": BATCH, "offset": offset}
            if extra:
                params.update(extra)
            page = self.request("GET", table, params=params).json()
            result.extend(page)
            if len(page) < BATCH:
                return result
            offset += BATCH

    def upsert(self, table, rows, conflict):
        for start in range(0, len(rows), BATCH):
            if not rows[start:start + BATCH]:
                continue
            self.request("POST", table, params={"on_conflict": conflict},
                         headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                         json=rows[start:start + BATCH])

    def delete(self, table, ids):
        for start in range(0, len(ids), BATCH):
            self.request("DELETE", table, params={
                "postulacion_id": f"in.({','.join(ids[start:start + BATCH])})"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrada", type=Path, default=OUT / "payload.json")
    args = parser.parse_args()
    cargar_env_local()
    conv_url, conv_key = os.getenv("CONV_SUPABASE_URL"), os.getenv("CONV_SUPABASE_SERVICE_ROLE_KEY")
    panel_url, panel_key = os.getenv("PANEL_SUPABASE_URL"), os.getenv("PANEL_SUPABASE_SERVICE_ROLE_KEY")
    if not all((conv_url, conv_key, panel_url, panel_key)):
        raise SystemExit("Faltan credenciales CONV/PANEL_SUPABASE")
    data = json.loads(args.entrada.read_text(encoding="utf-8"))
    items = data["postulaciones"]
    if len(items) != 24203:
        raise SystemExit(f"payload incompleto: {len(items)}")
    conv = Supa(conv_url, conv_key)
    panel = Supa(panel_url, panel_key)

    cohort = panel.get_all("cohorte_2026_ceds", "cedula,nombre,cohorte,retirado", order="cedula",
                           extra={"programa": "eq.jc"})
    if len(cohort) != 832:
        raise SystemExit(f"canon JC esperado 832, recibido {len(cohort)}")
    egresados_2025 = panel.get_all(
        "postulantes_jc", "cedula,nombre,participant_id,promo_year,rol", order="cedula",
        extra={"promo_year": "eq.2025", "rol": "eq.EGRESADO"})
    retirados_2025 = panel.get_all(
        "retiros", "cedula,participant_id,cohorte,programa", order="cedula",
        extra={"cohorte": "eq.2025", "programa": "eq.jc"})
    if len(egresados_2025) != 560 or len(retirados_2025) != 163:
        raise SystemExit(f"roster 2025 inesperado: egresados={len(egresados_2025)} retirados={len(retirados_2025)}")
    cedulas_egresados = {cedula_norm(x["cedula"]) for x in egresados_2025}
    cedulas_retirados = {cedula_norm(x["cedula"]) for x in retirados_2025}
    if cedulas_egresados & cedulas_retirados:
        raise SystemExit("roster 2025 no es disjunto: hay cédulas en egresados y retiros")
    cohort_2025 = [
        {**x, "cohorte": "2025", "retirado": False, "participant_id": x.get("participant_id")}
        for x in egresados_2025
    ] + [
        {**x, "nombre": None, "cohorte": "2025", "retirado": True,
         "participant_id": x.get("participant_id")}
        for x in retirados_2025
    ]
    roster = cohort + cohort_2025
    postulantes_jc = panel.get_all(
        "postulantes_jc", "cedula,participant_id,promo_year", order="cedula")
    participant_candidates = defaultdict(list)
    for x in postulantes_jc:
        key = cedula_norm(x.get("cedula"))
        if key and x.get("participant_id"):
            participant_candidates[(x.get("promo_year"), key)].append(x["participant_id"])
    metrics = panel.get_all(
        "participant_metrics",
        "participant_id,total_cursos_inscrito,total_cursos_completado,porcentaje_promedio",
        order="participant_id")
    metrics_by_participant = {x["participant_id"]: x for x in metrics}
    participant_by_cedula = {
        key: next((pid for pid in participant_ids if pid in metrics_by_participant), participant_ids[0])
        for key, participant_ids in participant_candidates.items()
    }
    posts = conv.get_all("postulaciones", "id,id_publico,convocatoria,pais,ciudad_norm,enviado_en,fuente,fila_origen",
                         order="id")
    if len(posts) != 24203:
        raise SystemExit(f"postulaciones destino esperado 24203, recibido {len(posts)}")
    by_key = {(x["convocatoria"], x["pais"], x["fuente"], x["fila_origen"]): x for x in posts}
    pii = {x["postulacion"]["id_publico"]: x["pii"] for x in items}
    payload_by_id = {x["postulacion"]["id_publico"]: x["postulacion"] for x in items}

    # Cada canon solo cruza contra su propia convocatoria: 2026 con 2026 y 2025 con 2025.
    by_ced, by_name = defaultdict(list), defaultdict(list)
    for item in items:
        p = item["postulacion"]
        key = (p["convocatoria"], p["pais"], p["fuente"], p["fila_origen"])
        db = by_key[key]
        candidate = {"item": item, "db": db, "name": pii[p["id_publico"]].get("nombre_norm")}
        if pii[p["id_publico"]].get("cedula_norm"):
            by_ced[(p["convocatoria"], pii[p["id_publico"]]["cedula_norm"])].append(candidate)
        if candidate["name"]:
            by_name[(p["convocatoria"], candidate["name"])].append(candidate)

    chosen, duplicate_rows, resolutions = {}, [], []
    assigned_posts = set()
    unresolved = []

    def latest(candidates):
        return max(candidates, key=lambda c: (c["item"]["postulacion"].get("enviado_en") or "", c["item"]["postulacion"]["id_publico"]))

    def resolve(candidates, canon, method):
        if not candidates:
            return None
        p0 = candidates[0]["item"]["postulacion"]
        ids = {c["item"]["postulacion"]["id_publico"] for c in candidates}
        documented_name_pair = method == "cedula" and ids == {20390, 21860}
        if any(c["item"]["postulacion"]["convocatoria"] != p0["convocatoria"] or
               c["item"]["postulacion"].get("ciudad_norm") != p0.get("ciudad_norm") or
               (c["name"] != candidates[0]["name"] and not documented_name_pair) for c in candidates):
            return None
        winner = latest(candidates)
        chosen[winner["item"]["postulacion"]["id_publico"]] = method
        for c in candidates:
            pid = c["item"]["postulacion"]["id_publico"]
            assigned_posts.add(pid)
            if pid == winner["item"]["postulacion"]["id_publico"]:
                continue
            duplicate_rows.append((pid, winner["item"]["postulacion"]["id_publico"]))
        if len(candidates) > 1:
            resolutions.append({"metodo": method, "id_elegida": winner["item"]["postulacion"]["id_publico"],
                                "ids_descartadas": ";".join(str(c["item"]["postulacion"]["id_publico"])
                                                               for c in candidates if c is not winner),
                                "decision": "mas_reciente_enviado_en;empate_id_publico"})
        return winner

    matched_cohort = set()
    for person in cohort:
        key = cedula_norm(person["cedula"])
        candidates = by_ced.get(("2026", key), [])
        if candidates:
            # Si el guardarraíl rechaza el grupo, se reintenta por nombre en la
            # segunda fase; no se convierte prematuramente en un fallo.
            if resolve(candidates, person, "cedula") is not None:
                matched_cohort.add(key)
    remaining = [person for person in cohort if cedula_norm(person["cedula"]) not in matched_cohort]
    for person in remaining:
        candidates = [c for c in by_name.get(("2026", nombre_norm(person["nombre"])), [])
                      if c["item"]["postulacion"]["id_publico"] not in assigned_posts]
        if resolve(candidates, person, "nombre") is None:
            unresolved.append((person, "nombre_ambiguo_o_sin_match"))
        else:
            matched_cohort.add(("nombre", nombre_norm(person["nombre"])))

    matched_2025 = 0
    for person in cohort_2025:
        candidates = by_ced.get(("2025", cedula_norm(person["cedula"])), [])
        method = "cedula"
        all_cedula_candidates = candidates
        if len(candidates) > 1 and person.get("nombre"):
            same_name = [c for c in candidates if c["name"] == nombre_norm(person["nombre"])]
            if len(same_name) == 1:
                candidates = same_name
        if not candidates:
            candidates = [c for c in by_name.get(("2025", nombre_norm(person.get("nombre"))), [])
                          if c["item"]["postulacion"]["id_publico"] not in assigned_posts]
            method = "nombre"
        winner = resolve(candidates, person, method)
        if winner is not None:
            if method == "cedula" and len(all_cedula_candidates) > len(candidates):
                winner_id = winner["item"]["postulacion"]["id_publico"]
                for candidate in all_cedula_candidates:
                    duplicate_id = candidate["item"]["postulacion"]["id_publico"]
                    if duplicate_id != winner_id and (duplicate_id, winner_id) not in duplicate_rows:
                        duplicate_rows.append((duplicate_id, winner_id))

            matched_2025 += 1
    print(f"T5: roster 2025 cruzado={matched_2025}/{len(cohort_2025)}")

    expected_selected = len(cohort) + matched_2025
    if unresolved or len(chosen) != expected_selected or len(duplicate_rows) < 6:
        with (OUT / "matches_ambiguos.csv").open("w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh); writer.writerow(["tipo", "detalle"])
            writer.writerows([[kind, "canon_sin_resolver"] for _, kind in unresolved])
        raise SystemExit(f"T5 FALLA: seleccionadas={len(chosen)}/{expected_selected} duplicados={len(duplicate_rows)} "
                         f"resoluciones={len(resolutions)} sin_resolver={len(unresolved)}")

    # Documenta las seis resoluciones, incluidas las cinco por cédula y una por nombre.
    with (OUT / "matches_ambiguos.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["metodo", "id_elegida", "ids_descartadas", "decision"])
        writer.writeheader(); writer.writerows(resolutions)

    duplicate_of = dict(duplicate_rows)
    result = []
    for item in items:
        p = item["postulacion"]
        key = (p["convocatoria"], p["pais"], p["fuente"], p["fila_origen"])
        db = by_key[key]
        pid = p["id_publico"]
        result.append({"postulacion_id": db["id"], "seleccionado": pid in chosen,
                       "fase_max_alcanzada": "matriculado" if pid in chosen else "fase1",
                       "motivo_no_seleccion": None,
                       "metodo_match": chosen.get(pid), "match_confianza": "alta" if chosen.get(pid) == "cedula" else ("media" if chosen.get(pid) else None),
                       "duplicado_de": duplicate_of.get(pid)})
    conv.upsert("resultado_seleccion", result, "postulacion_id")
    selected_ids = [r["postulacion_id"] for r in result if r["seleccionado"]]
    conv.delete("resultado_programa", selected_ids)
    programs = []
    for person in roster:
        candidates = by_ced.get((person["cohorte"], cedula_norm(person["cedula"])), [])
        if not candidates:
            candidates = by_name.get((person["cohorte"], nombre_norm(person.get("nombre"))), [])
        candidates = [c for c in candidates if c["item"]["postulacion"]["id_publico"] in chosen]
        if not candidates:
            continue
        winner = latest(candidates)
        db = winner["db"]
        participant_id = person.get("participant_id") or participant_by_cedula.get(
            (person.get("cohorte"), cedula_norm(person["cedula"]))
        )
        retired_without_history = person.get("cohorte") == "2025" and person.get("retirado")
        metric = (metrics_by_participant.get(participant_id)
                  if participant_id and not retired_without_history else None)
        programs.append({"postulacion_id": db["id"], "cedula_canon": cedula_norm(person["cedula"]),
                         "cohorte": person.get("cohorte"), "retirado": person.get("retirado"),
                         "fecha_retiro": None, "motivo_retiro": None,
                         "pct_avance": metric.get("porcentaje_promedio") if metric else None,
                         "cursos_inscritos": metric.get("total_cursos_inscrito") if metric else None,
                         "cursos_aprobados": metric.get("total_cursos_completado") if metric else None,
                         "estado_final": None})
    metric_2025 = sum(1 for person in [x for x in cohort_2025 if not x.get("retirado")]
                      if person.get("participant_id") in metrics_by_participant)
    metric_2026 = sum(1 for person in cohort
                      if participant_by_cedula.get(("2026", cedula_norm(person["cedula"])))
                      in metrics_by_participant)
    if (metric_2025, metric_2026) != (559, 776):
        raise SystemExit(f"T5 FALLA: cobertura_metricas_2025={metric_2025}/560 "
                         f"cobertura_metricas_2026={metric_2026}/832")
    conv.upsert("resultado_programa", programs, "postulacion_id")
    loaded_2025 = sum(x["cohorte"] == "2025" and x["cursos_aprobados"] is not None for x in programs)
    loaded_2026 = sum(x["cohorte"] == "2026" and x["cursos_aprobados"] is not None for x in programs)
    print(f"T5 OK: seleccionadas={len(chosen)} (2026={len(cohort)} 2025={matched_2025}) "
          f"duplicados={len(duplicate_rows)} universo={len(result)} "
          f"metricas_2025={loaded_2025} metricas_2026={loaded_2026}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
