"""Ubah anotasi poligon LabelMe (*.json) menjadi masker PNG berindeks kelas.

Konvensi nama file foto:  <ID_MUATAN>_<TPS>_f<NN>.jpg
contoh: M001_PasarLegi_f01.jpg. Semua foto dari satu muatan (atau satu porsi
campuran laboratorium) harus memakai ID_MUATAN yang sama, karena pembagian
latih/uji dilakukan per muatan (GroupKFold) agar tidak terjadi kebocoran data.

Pemakaian:
  python labelme_ke_mask.py --masuk data/anotasi --keluar data/siap

Hasil: data/siap/gambar/*.jpg, data/siap/masker/*.png, data/siap/meta.csv
Bagian foto yang tidak dipoligon dianggap latar (0). Poligon bernama
"abaikan" diberi 255 (tidak dihitung). Poligon kecil digambar terakhir agar
tidak tertimpa poligon besar.
"""
from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from karta_kelas import kelas_dari_label


def gambar_dari_json(js: dict, folder: Path) -> np.ndarray:
    if js.get("imageData"):
        return np.array(Image.open(io.BytesIO(base64.b64decode(js["imageData"]))).convert("RGB"))
    return np.array(Image.open(folder / js["imagePath"]).convert("RGB"))


def luas(titik: np.ndarray) -> float:
    return float(abs(cv2.contourArea(titik.astype(np.float32))))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--masuk", required=True)
    ap.add_argument("--keluar", required=True)
    ap.add_argument("--pola-muatan", default=r"^([A-Za-z0-9-]+?)_", help="regex untuk mengambil ID muatan dari nama file")
    a = ap.parse_args()
    masuk, keluar = Path(a.masuk), Path(a.keluar)
    (keluar / "gambar").mkdir(parents=True, exist_ok=True)
    (keluar / "masker").mkdir(parents=True, exist_ok=True)
    baris, tak_dikenal = [], {}
    for p in sorted(masuk.glob("*.json")):
        js = json.loads(p.read_text(encoding="utf-8"))
        img = gambar_dari_json(js, p.parent)
        h, w = img.shape[:2]
        mask = np.zeros((h, w), np.uint8)
        bentuk = []
        for s in js.get("shapes", []):
            k = kelas_dari_label(s["label"])
            if k is None:
                tak_dikenal[s["label"]] = tak_dikenal.get(s["label"], 0) + 1
                continue
            t = np.array(s["points"], np.float32)
            if s.get("shape_type") == "rectangle":
                (x0, y0), (x1, y1) = t[0], t[1]
                t = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], np.float32)
            if len(t) >= 3:
                bentuk.append((luas(t), k, t))
        for _, k, t in sorted(bentuk, key=lambda b: -b[0]):
            cv2.fillPoly(mask, [np.round(t).astype(np.int32)], int(k))
        nama = p.stem
        Image.fromarray(img).save(keluar / "gambar" / f"{nama}.jpg", quality=95)
        Image.fromarray(mask).save(keluar / "masker" / f"{nama}.png")
        m = re.match(a.pola_muatan, nama)
        bagian = nama.split("_")
        baris.append({"foto": nama, "id_muatan": m.group(1) if m else nama, "tps": bagian[1] if len(bagian) > 2 else "", "set": ""})
    with open(keluar / "meta.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=["foto", "id_muatan", "tps", "set"])
        wr.writeheader()
        wr.writerows(baris)
    print(f"{len(baris)} foto diubah menjadi masker -> {keluar}")
    if tak_dikenal:
        print("PERINGATAN: label tidak dikenal (diabaikan):", tak_dikenal)
        print("Tambahkan ke ALIAS di karta_kelas.py bila perlu.")


if __name__ == "__main__":
    main()
