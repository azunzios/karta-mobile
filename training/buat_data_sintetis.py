"""Buat data SINTETIS untuk menguji alur pelatihan dari ujung ke ujung.

PENTING: gambar ini adalah tekstur buatan komputer, BUKAN foto sampah. Model
yang dilatih dari data ini hanya membuktikan bahwa alur latih -> evaluasi ->
ekspor ONNX -> aplikasi berjalan. Model ini tidak boleh dilaporkan sebagai
model pengenal sampah. Model sebenarnya dilatih dari foto tim (labelme_ke_mask.py).

Setiap "muatan" dibuat sebagai pita konveyor panjang berisi benda acak dengan
komposisi tertentu, lalu dipotong menjadi beberapa frame yang bergeser, mirip
kamera di atas konveyor. Frame dari muatan yang sama berbagi ID_MUATAN.

  python buat_data_sintetis.py --keluar data/sintetis --muatan 48 --frame 5 --ukuran 256
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

rng = np.random.default_rng(2026)


def tekstur(h, w, dasar, ragam, skala=3):
    kecil = rng.normal(0, 1, (max(2, h // (skala * 4)), max(2, w // (skala * 4)), 3))
    besar = cv2.resize(kecil, (w, h), interpolation=cv2.INTER_CUBIC)
    halus = rng.normal(0, 0.35, (h, w, 3))
    return np.clip(np.array(dasar)[None, None, :] + ragam * (besar + halus), 0, 255)


def blob(cx, cy, r, n=14):
    sudut = np.sort(rng.uniform(0, 2 * np.pi, n))
    jari = r * rng.uniform(0.55, 1.15, n)
    return np.stack([cx + jari * np.cos(sudut), cy + jari * np.sin(sudut)], 1)


def poligon_tajam(cx, cy, r):
    n = rng.integers(4, 7)
    sudut = np.sort(rng.uniform(0, 2 * np.pi, n))
    jari = r * rng.uniform(0.6, 1.0, n)
    return np.stack([cx + jari * np.cos(sudut), cy + jari * np.sin(sudut)], 1)


def persegi(cx, cy, r):
    w, h, a = r * rng.uniform(0.8, 1.6), r * rng.uniform(0.6, 1.2), rng.uniform(0, 180)
    return cv2.boxPoints(((cx, cy), (w * 2, h * 2), a))


def batang(cx, cy, r):
    a = rng.uniform(0, np.pi)
    L, T = r * rng.uniform(1.6, 2.8), r * rng.uniform(0.12, 0.25)
    d, n = np.array([np.cos(a), np.sin(a)]), np.array([-np.sin(a), np.cos(a)])
    c = np.array([cx, cy])
    return np.stack([c - d * L - n * T, c + d * L - n * T, c + d * L + n * T, c - d * L + n * T])


# kelas: (pembentuk, daftar warna dasar, ragam, skala tekstur)
GAYA = {
    1: (blob, [(92, 74, 40), (70, 110, 45), (150, 110, 40), (120, 60, 35), (160, 140, 60)], 22, 2),
    2: (poligon_tajam, [(30, 30, 35), (210, 210, 220), (40, 90, 200), (200, 40, 50), (240, 200, 40), (230, 240, 245)], 12, 6),
    3: (persegi, [(190, 160, 115), (225, 220, 205), (170, 130, 85), (240, 238, 230)], 9, 8),
    4: (blob, [(150, 40, 90), (60, 70, 140), (180, 150, 140), (40, 120, 120)], 16, 1),
    5: (batang, [(110, 75, 45), (140, 100, 60), (90, 65, 40)], 14, 3),
    6: (blob, [(120, 120, 118), (150, 145, 135), (95, 90, 85), (170, 175, 180)], 18, 1),
}


def pita(panjang, tinggi, proporsi):
    img = tekstur(tinggi, panjang, (55, 58, 62), 6, 6)
    img[:, :, :] += (np.sin(np.arange(panjang) / 9.0)[None, :, None] * 3)
    mask = np.zeros((tinggi, panjang), np.uint8)
    luas_target = panjang * tinggi * rng.uniform(0.75, 1.1)
    luas = 0.0
    while luas < luas_target:
        k = int(rng.choice(np.arange(1, 7), p=proporsi))
        bentuk, warna, ragam, skala = GAYA[k]
        r = rng.uniform(10, 34) * (0.7 if k == 6 else 1.0)
        cx, cy = rng.uniform(0, panjang), rng.uniform(0, tinggi)
        t = np.round(bentuk(cx, cy, r)).astype(np.int32)
        x0, y0 = max(0, t[:, 0].min() - 6), max(0, t[:, 1].min() - 6)
        x1, y1 = min(panjang, t[:, 0].max() + 7), min(tinggi, t[:, 1].max() + 7)
        if x1 - x0 < 3 or y1 - y0 < 3:
            continue
        hh, ww = y1 - y0, x1 - x0
        m = np.zeros((hh, ww), np.uint8)
        cv2.fillPoly(m, [t - np.array([x0, y0])], 1)
        tex = tekstur(hh, ww, warna[rng.integers(len(warna))], ragam, skala)
        if k == 4:  # motif kain bergaris
            garis = ((np.arange(ww)[None, :] + np.arange(hh)[:, None]) // 5 % 2).astype(float)
            tex = tex * (0.8 + 0.25 * garis[..., None])
        if k == 2:  # kilap plastik
            gx = cv2.GaussianBlur(m.astype(float), (0, 0), 4)
            tex = tex + 70 * np.clip(gx - 0.6, 0, 1)[..., None]
        bayang = cv2.GaussianBlur(m.astype(float), (0, 0), 3)
        sub = img[y0:y1, x0:x1] * (1 - 0.25 * bayang[..., None])
        sub[m == 1] = tex[m == 1]
        img[y0:y1, x0:x1] = sub
        mask[y0:y1, x0:x1][m == 1] = k
        luas += m.sum()
    return np.clip(img, 0, 255).astype(np.uint8), mask


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keluar", required=True)
    ap.add_argument("--muatan", type=int, default=48)
    ap.add_argument("--frame", type=int, default=5)
    ap.add_argument("--ukuran", type=int, default=256)
    a = ap.parse_args()
    out = Path(a.keluar)
    (out / "gambar").mkdir(parents=True, exist_ok=True)
    (out / "masker").mkdir(parents=True, exist_ok=True)
    s = a.ukuran
    baris = []
    tps = ["PasarLegi", "Permukiman", "RuangPublik", "PasarGede"]
    for i in range(a.muatan):
        # Komposisi muatan: pasar lebih organik, ruang publik lebih plastik.
        dasar = np.array([4.0, 2.0, 1.2, 0.5, 0.8, 0.6]) if i % 4 in (0, 3) else np.array([2.0, 3.0, 1.5, 0.7, 0.8, 1.0])
        proporsi = rng.dirichlet(dasar * 2)
        img, mask = pita(s * (a.frame + 1), s, proporsi)
        for f in range(a.frame):
            x0 = int(f * s * rng.uniform(0.8, 1.0))
            nama = f"S{i:03d}_{tps[i % 4]}_f{f + 1:02d}"
            Image.fromarray(img[:, x0:x0 + s]).save(out / "gambar" / f"{nama}.jpg", quality=92)
            Image.fromarray(mask[:, x0:x0 + s]).save(out / "masker" / f"{nama}.png")
            baris.append({"foto": nama, "id_muatan": f"S{i:03d}", "tps": tps[i % 4], "set": ""})
    with open(out / "meta.csv", "w", newline="", encoding="utf-8") as fh:
        wr = csv.DictWriter(fh, fieldnames=["foto", "id_muatan", "tps", "set"])
        wr.writeheader()
        wr.writerows(baris)
    print(f"{len(baris)} frame sintetis dari {a.muatan} muatan -> {out}")


if __name__ == "__main__":
    main()
