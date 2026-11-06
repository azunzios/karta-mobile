"""Buat dan bekukan pembagian data KARTA (lampiran Subbab 3.3).

Langkah:
1. Set uji akhir diambil acak berstrata per lokasi (kolom `tps`) dengan benih tetap:
   default 3 unit per lokasi, dan 6 unit untuk lokasi campuran buatan (D4).
   Bila ada kolom `oven` (1 = unit diuji oven), unit uji dipilih dari unit yang diuji oven.
2. Unit sisanya dibagi ke 5 lipatan dengan StratifiedGroupKFold
   (kelompok = id_muatan, strata = lokasi).
3. Hasil ditulis ke meta.csv (kolom `set` dan `lipatan`) dan split_v1.csv, lalu
   sidik jari SHA-256 dicetak untuk dicatat di laporan.

Contoh:
  python buat_split.py --data data/siap --uji-per-lokasi 3 --khusus Campuran=6 --lipatan 5
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import random
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold


def sidik(baris: list[dict]) -> str:
    teks = "\n".join(f"{r['foto']},{r['id_muatan']},{r['set']},{r['lipatan']}" for r in sorted(baris, key=lambda r: r["foto"]))
    return hashlib.sha256(teks.encode("utf-8")).hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="folder berisi meta.csv")
    ap.add_argument("--uji-per-lokasi", type=int, default=3)
    ap.add_argument("--khusus", nargs="*", default=["Campuran=6"], help="jumlah unit uji khusus per lokasi, mis. Campuran=6")
    ap.add_argument("--lipatan", type=int, default=5)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--keluar", default="split_v1.csv")
    a = ap.parse_args()

    folder = Path(a.data)
    with open(folder / "meta.csv", encoding="utf-8") as f:
        baris = list(csv.DictReader(f))
    if any(r.get("set") for r in baris):
        raise SystemExit("meta.csv sudah berisi kolom set. Pembagian dibekukan; jangan dibuat ulang.")

    khusus = {k: int(v) for k, v in (s.split("=") for s in a.khusus)}
    unit_lokasi: dict[str, str] = {}
    unit_oven: dict[str, bool] = {}
    for r in baris:
        unit_lokasi[r["id_muatan"]] = r.get("tps") or "?"
        unit_oven[r["id_muatan"]] = unit_oven.get(r["id_muatan"], False) or r.get("oven", "") in ("1", "ya", "true")
    per_lokasi: dict[str, list[str]] = defaultdict(list)
    for u, lok in sorted(unit_lokasi.items()):
        per_lokasi[lok].append(u)

    acak = random.Random(a.seed)
    uji: set[str] = set()
    for lok, unit in sorted(per_lokasi.items()):
        n = khusus.get(lok, a.uji_per_lokasi)
        calon = [u for u in unit if unit_oven[u]] if any(unit_oven.values()) else unit
        if len(calon) < n:
            calon = unit
        pilih = acak.sample(calon, min(n, max(0, len(unit) - a.lipatan)))
        uji.update(pilih)

    for r in baris:
        r["set"] = "uji" if r["id_muatan"] in uji else "pengembangan"
        r["lipatan"] = ""
    dev = [i for i, r in enumerate(baris) if r["set"] == "pengembangan"]
    y = np.array([unit_lokasi[baris[i]["id_muatan"]] for i in dev])
    g = np.array([baris[i]["id_muatan"] for i in dev])
    sgk = StratifiedGroupKFold(n_splits=a.lipatan, shuffle=True, random_state=a.seed)
    for f, (_, vi) in enumerate(sgk.split(np.zeros(len(dev)), y, g)):
        for j in vi:
            baris[dev[j]]["lipatan"] = str(f)

    # pemeriksaan kebocoran
    u_uji = {r["id_muatan"] for r in baris if r["set"] == "uji"}
    u_dev = {r["id_muatan"] for r in baris if r["set"] == "pengembangan"}
    assert not (u_uji & u_dev), "kebocoran: unit uji juga ada di data pengembangan"
    lip_unit: dict[str, set] = defaultdict(set)
    for r in baris:
        if r["lipatan"]:
            lip_unit[r["id_muatan"]].add(r["lipatan"])
    assert all(len(v) == 1 for v in lip_unit.values()), "kebocoran: satu unit tersebar di beberapa lipatan"

    kolom = list(baris[0].keys())
    for jalur in (folder / "meta.csv", folder / a.keluar):
        with open(jalur, "w", newline="", encoding="utf-8") as f:
            wr = csv.DictWriter(f, fieldnames=kolom)
            wr.writeheader()
            wr.writerows(baris)

    print("Lokasi | unit | uji | pengembangan")
    for lok, unit in sorted(per_lokasi.items()):
        nu = sum(u in uji for u in unit)
        print(f"{lok} | {len(unit)} | {nu} | {len(unit) - nu}")
    for f in range(a.lipatan):
        unit_f = {r["id_muatan"] for r in baris if r["lipatan"] == str(f)}
        print(f"lipatan {f}: {len(unit_f)} unit, {sum(r['lipatan'] == str(f) for r in baris)} foto")
    print(f"Foto uji: {sum(r['set'] == 'uji' for r in baris)} dari {len(u_uji)} unit")
    print(f"SHA-256 pembagian: {sidik(baris)}")


if __name__ == "__main__":
    main()
