"""(Opsional) Ubah ZeroWaste-f menjadi masker KARTA untuk pralatih (lampiran Subbab 3.1.6).

ZeroWaste-f (Bashkirova dkk., CVPR 2022) berisi 1.874 frame konveyor fasilitas daur ulang
(latih 1.245, validasi 312, uji 317) dengan anotasi poligon empat kelas: cardboard,
soft plastic, rigid plastic, metal. Lisensi CC BY-NC 4.0 (NONKOMERSIAL): boleh untuk
penelitian dan hackathon, tetapi model yang dijual harus dilatih ulang tanpa ZeroWaste.

Hanya bagian latih yang dipakai. Pemetaan:
  cardboard -> kertas_kardus, soft/rigid plastic -> plastik, metal -> inert,
  latar (termasuk sampah lain yang tidak dilabeli) -> 255 (abaikan).

Contoh:
  python zerowaste_ke_karta.py --anotasi zerowaste-f-final/train/labels.json \
      --gambar zerowaste-f-final/train/data --keluar data/zerowaste
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from karta_kelas import ABAIKAN, KELAS


def kelas_zerowaste(nama: str) -> int:
    n = nama.lower().replace("-", " ").replace("_", " ")
    if "cardboard" in n:
        return KELAS.index("kertas_kardus")
    if "plastic" in n:
        return KELAS.index("plastik")
    if "metal" in n:
        return KELAS.index("inert")
    return ABAIKAN


def isi_segmen(mask: np.ndarray, seg, nilai: int) -> None:
    if isinstance(seg, list):  # poligon
        for s in seg:
            t = np.array(s, np.float32).reshape(-1, 2)
            if len(t) >= 3:
                cv2.fillPoly(mask, [np.round(t).astype(np.int32)], nilai)
    elif isinstance(seg, dict):  # RLE
        from pycocotools import mask as cm

        rle = cm.frPyObjects(seg, *seg["size"]) if isinstance(seg.get("counts"), list) else seg
        mask[cm.decode(rle).astype(bool)] = nilai


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--anotasi", required=True, help="labels.json (format COCO) bagian latih")
    ap.add_argument("--gambar", required=True)
    ap.add_argument("--keluar", required=True)
    a = ap.parse_args()
    js = json.loads(Path(a.anotasi).read_text())
    kat = {c["id"]: kelas_zerowaste(c["name"]) for c in js["categories"]}
    print("pemetaan:", {c["name"]: KELAS[kat[c["id"]]] if kat[c["id"]] != ABAIKAN else "abaikan" for c in js["categories"]})
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
        img = Image.open(p).convert("RGB")
        w, h = img.size
        mask = np.full((h, w), ABAIKAN, np.uint8)
        for x in sorted(ann.get(im["id"], []), key=lambda x: -x.get("area", 0)):
            isi_segmen(mask, x.get("segmentation", []), int(kat[x["category_id"]]))
        nama = f"ZW_{im['id']:05d}"
        img.save(out / "gambar" / f"{nama}.jpg", quality=92)
        Image.fromarray(mask).save(out / "masker" / f"{nama}.png")
        # satu video = satu kelompok, agar frame berurutan tidak dianggap bebas
        baris.append({"foto": nama, "id_muatan": Path(im["file_name"]).stem.rsplit("_", 1)[0], "tps": "ZeroWaste", "set": ""})
    with open(out / "meta.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=["foto", "id_muatan", "tps", "set"])
        wr.writeheader()
        wr.writerows(baris)
    print(f"{len(baris)} frame ZeroWaste-f -> {out}")


if __name__ == "__main__":
    main()
