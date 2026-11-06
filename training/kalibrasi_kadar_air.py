"""Kalibrasi model kadar air dari data uji oven (lampiran Subbab 3.6, Pers. 3.9-3.12).

Masukan: CSV uji oven, satu baris per muatan/porsi yang diuji (lihat templat/uji_oven.csv):
  id_muatan, tanggal, tps, jenis_tps (pasar|permukiman|ruang_publik|lainnya),
  hujan_24, hujan_72 (mm), organik, plastik, kertas, tekstil, kayu, inert (persen MASSA, hasil pilah-timbang
  atau kolom komposisi dari CSV aplikasi), w_oven (persen, ASTM E790-15).

Langkah:
1. w_fisika = sum(y_k * w_k)                                   (Pers. 3.9)
2. koreksi ridge  delta(x) = b0 + b.x, lambda dipilih dengan LOO   (Pers. 3.10-3.11)
3. Jackknife+: simpan n model tinggalkan-satu dan galat R_i         (Pers. 3.12)
Keluaran: kadar-air.json -> salin ke karta-mobile/public/models/kadar-air.json

  python kalibrasi_kadar_air.py --data uji_oven.csv --keluar kadar-air.json
  python kalibrasi_kadar_air.py --demo 40 --keluar demo.json   # data rekaan, hanya untuk mencoba
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from datetime import datetime

import numpy as np

FRAKSI = ["organik", "plastik", "kertas", "tekstil", "kayu", "inert"]
W_K = np.array([0.70, 0.05, 0.10, 0.15, 0.40, 0.05])  # Tabel 3.5, sama dengan lib/karta/konstanta.ts
SERAP = np.array([1, 0, 1, 1, 0, 0], float)            # organik, kertas, tekstil
FITUR = ["log1p_R24", "log1p_R72", "R24_x_serap", "tps_pasar"]
LAMBDA = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100]


def fitur(y: np.ndarray, r24: np.ndarray, r72: np.ndarray, pasar: np.ndarray) -> np.ndarray:
    return np.column_stack([np.log1p(r24), np.log1p(r72), r24 * (y @ SERAP), pasar])


def ridge(Xs: np.ndarray, t: np.ndarray, lam: float) -> tuple[float, np.ndarray]:
    """Ridge dengan intersep tidak dipenalti; Xs sudah distandardisasi."""
    xm, tm = Xs.mean(0), t.mean()
    Xc, tc = Xs - xm, t - tm
    b = np.linalg.solve(Xc.T @ Xc + lam * np.eye(Xs.shape[1]), Xc.T @ tc)
    return float(tm - xm @ b), b


def loo(Xs, t, lam):
    n = len(t)
    pred = np.empty(n)
    model = []
    for i in range(n):
        m = np.arange(n) != i
        b0, b = ridge(Xs[m], t[m], lam)
        pred[i] = b0 + Xs[i] @ b
        model.append((b0, b))
    return pred, model


def baca(path: str):
    with open(path, encoding="utf-8") as f:
        r = list(csv.DictReader(f))
    y = np.array([[float(x[k]) for k in FRAKSI] for x in r]) / 100
    y = y / y.sum(1, keepdims=True)
    return (y, np.array([float(x["hujan_24"] or 0) for x in r]), np.array([float(x["hujan_72"] or 0) for x in r]),
            np.array([1.0 if x["jenis_tps"].strip().lower() == "pasar" else 0.0 for x in r]), np.array([float(x["w_oven"]) for x in r]) / 100)


def demo(n: int, seed: int = 7):
    """Data REKAAN untuk mencoba skrip. Jangan dipakai sebagai hasil."""
    g = np.random.default_rng(seed)
    y = g.dirichlet([4, 1.5, 1, 0.4, 0.8, 0.5], n)
    r24 = g.gamma(0.6, 12, n)
    r72 = r24 + g.gamma(0.8, 15, n)
    pasar = (g.random(n) < 0.4).astype(float)
    w = y @ (W_K + np.array([0.08, 0.03, 0.05, 0.05, 0.05, 0.02])) + 0.012 * np.log1p(r24) * (y @ SERAP) * 3 + 0.03 * pasar + g.normal(0, 0.03, n)
    return y, r24, r72, pasar, np.clip(w, 0.05, 0.9)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data")
    ap.add_argument("--demo", type=int, default=0)
    ap.add_argument("--alpha", type=float, default=0.2)
    ap.add_argument("--keluar", required=True)
    a = ap.parse_args()
    y, r24, r72, pasar, w = demo(a.demo) if a.demo else baca(a.data)
    n = len(w)
    if n < 10:
        raise SystemExit("Minimal 10 data uji oven untuk kalibrasi (disarankan >= 30).")
    wf = y @ W_K
    X = fitur(y, r24, r72, pasar)
    rata, sb = X.mean(0), X.std(0)
    sb[sb == 0] = 1
    Xs = (X - rata) / sb
    t = w - wf  # target koreksi
    skor = {lam: float(np.mean(np.abs(t - loo(Xs, t, lam)[0]))) for lam in LAMBDA}
    lam = min(skor, key=skor.get)
    b0, b = ridge(Xs, t, lam)
    pred_loo, model = loo(Xs, t, lam)
    R = np.abs(t - pred_loo)
    galat_fisika = np.abs(w - wf)
    galat_hibrida = R
    # Lebar rata-rata rentang Jackknife+ pada data sendiri (indikatif)
    lebar = []
    for j in range(n):
        mu = np.array([wf[j] + m0 + Xs[j] @ mb for m0, mb in model])
        lo = np.sort(mu - R)[max(0, math.floor(a.alpha * (n + 1)) - 1)]
        hi = np.sort(mu + R)[min(n, math.ceil((1 - a.alpha) * (n + 1))) - 1]
        lebar.append(hi - lo)
    hasil = {
        "versi": datetime.now().strftime("%Y%m%d-%H%M") + ("-DEMO-REKAAN" if a.demo else ""),
        "metode": "jackknife+", "n": n, "alpha": a.alpha, "fitur": FITUR,
        "rerata": rata.round(6).tolist(), "sb": sb.round(6).tolist(), "b0": round(b0, 6), "b": np.round(b, 6).tolist(),
        "loo": [{"b0": round(m0, 6), "b": np.round(mb, 6).tolist(), "r": round(float(r), 6)} for (m0, mb), r in zip(model, R)],
        "lambda": lam,
        "evaluasi_loo": {"mae_fisika_pp": round(float(galat_fisika.mean() * 100), 2), "mae_hibrida_pp": round(float(galat_hibrida.mean() * 100), 2),
                          "rmse_hibrida_pp": round(float(np.sqrt((galat_hibrida ** 2).mean()) * 100), 2), "lebar_rentang_rerata_pp": round(float(np.mean(lebar) * 100), 1)},
        "catatan": "DATA REKAAN untuk mencoba skrip, bukan hasil uji oven." if a.demo else "Dikalibrasi dari data uji oven tim.",
    }
    with open(a.keluar, "w", encoding="utf-8") as f:
        json.dump(hasil, f, indent=1, ensure_ascii=False)
    print(json.dumps({k: hasil[k] for k in ("versi", "n", "lambda", "evaluasi_loo")}, indent=1))
    if n >= 200:
        print("n >= 200: pertimbangkan CQR (Subbab 3.6.3) di server; aplikasi tetap dapat memakai Jackknife+.")


if __name__ == "__main__":
    main()
