"""(Opsional) Ubah dataset TACO menjadi masker KARTA untuk pralatih.

TACO (Proença & Simões, 2020; http://tacodataset.org, lisensi CC BY 4.0)
berisi ±1.500 foto sampah dengan anotasi poligon. Unduh di Colab:
  git clone https://github.com/pedropro/TACO && cd TACO && python download.py
lalu:
  python taco_ke_karta.py --anotasi TACO/data/annotations.json --gambar TACO/data --keluar data/taco

Catatan: TACO adalah sampah kering berserakan di alam terbuka, bukan muatan
sampah basah. Gunakan hanya untuk pralatih, jangan untuk data uji KARTA.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

from karta_kelas import kelas_taco


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--anotasi", required=True)
    ap.add_argument("--gambar", required=True)
    ap.add_argument("--keluar", required=True)
    ap.add_argument("--sisi", type=int, default=1024, help="sisi terpanjang setelah diperkecil")
    a = ap.parse_args()
    js = json.loads(Path(a.anotasi).read_text())
    kat = {c["id"]: kelas_taco(c["name"], c.get("supercategory", "")) for c in js["categories"]}
    ann: dict[int, list] = {}
    for x in js["annotations"]:
        ann.setdefault(x["image_id"], []).append(x)
    out = Path(a.keluar)
    (out / "gambar").mkdir(parents=True, exist_ok=True)
    (out / "masker").mkdir(parents=True, exist_ok=True)
    baris = []
    for im in js["images"]:
        p = Path(a.gambar) / im["file_name"]
        if not p.exists():
            continue
        img = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        w, h = img.size
        mask = np.zeros((h, w), np.uint8)
        for x in sorted(ann.get(im["id"], []), key=lambda x: -x.get("area", 0)):
            for seg in x.get("segmentation", []):
                t = np.array(seg, np.float32).reshape(-1, 2)
                if len(t) >= 3:
                    cv2.fillPoly(mask, [np.round(t).astype(np.int32)], int(kat[x["category_id"]]))
        s = a.sisi / max(w, h)
        if s < 1:
            img = img.resize((round(w * s), round(h * s)), Image.BILINEAR)
            mask = cv2.resize(mask, img.size, interpolation=cv2.INTER_NEAREST)
        nama = f"TACO_{im['id']:05d}"
        img.save(out / "gambar" / f"{nama}.jpg", quality=92)
        Image.fromarray(mask).save(out / "masker" / f"{nama}.png")
        baris.append({"foto": nama, "id_muatan": nama, "tps": Path(im["file_name"]).parent.name, "set": ""})
    with open(out / "meta.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=["foto", "id_muatan", "tps", "set"])
        wr.writeheader()
        wr.writerows(baris)
    print(f"{len(baris)} foto TACO -> {out}")


if __name__ == "__main__":
    main()
