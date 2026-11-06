"""Latih, evaluasi, dan ekspor model segmentasi KARTA (DeepLabv3+).

Sesuai lampiran Subbab 3.3, 3.4, dan 3.9:
- Arsitektur DeepLabv3+ (segmentation_models_pytorch), encoder ResNet-50 pralatih ImageNet.
- Kerugian Focal (gamma=2, bobot kelas) + Dice (Persamaan 3.2-3.4), piksel 255 diabaikan.
- AdamW: lr encoder 1e-4, decoder 1e-3, weight decay 1e-4, polynomial decay 0,9.
- Pembagian data PER MUATAN: set uji dan lipatan dibaca dari meta.csv hasil buat_split.py
  (StratifiedGroupKFold, strata = lokasi); opsi --lolo untuk validasi tinggalkan-satu-lokasi.
- Metrik: IoU per kelas, mIoU, matriks kebingungan, MAE proporsi fraksi per muatan (poin persen),
  selang kepercayaan 95% bootstrap berkelompok per muatan (2.000 ulangan) pada set uji akhir.
- Ekspor ONNX (masukan "masukan" [1,3,H,W], keluaran "prob" [1,7,H,W]) + berkas meta JSON
  yang dibaca aplikasi (public/models/karta-seg.onnx dan karta-seg.json).

Contoh (Colab, data foto tim):
  python buat_split.py --data data/siap            # sekali saja, lalu bekukan
  python latih.py --data data/siap --keluar hasil/v1 --encoder resnet50 --bobot imagenet \
      --ukuran 512 --epoch 80 --batch 8 --cv 5 --lolo --kuantisasi
Contoh uji alur cepat di CPU (data sintetis):
  python latih.py --data data/sintetis --keluar hasil/uji --encoder mobilenet_v2 --bobot none \
      --ukuran 256 --epoch 8 --batch 8 --label-data sintetis-uji-alur
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
import hashlib

from sklearn.model_selection import GroupKFold, GroupShuffleSplit, StratifiedGroupKFold
from torch.utils.data import DataLoader, Dataset

from karta_kelas import ABAIKAN, KELAS, NAMA, WARNA

C = len(KELAS)
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def seed_all(s: int) -> None:
    random.seed(s)
    np.random.seed(s)
    torch.manual_seed(s)


# ---------------------------------------------------------------- data
def baca_meta(folder: Path) -> list[dict]:
    with open(folder / "meta.csv", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f)]


class DataSampah(Dataset):
    def __init__(self, folder: Path, baris: list[dict], ukuran: int, latih: bool):
        self.folder, self.baris, self.s, self.latih = folder, baris, ukuran, latih

    def __len__(self) -> int:
        return len(self.baris)

    def muat(self, i: int):
        nama = self.baris[i]["foto"]
        img = np.array(Image.open(self.folder / "gambar" / f"{nama}.jpg").convert("RGB"))
        mask = np.array(Image.open(self.folder / "masker" / f"{nama}.png"))
        return img, mask

    def __getitem__(self, i: int):
        img, mask = self.muat(i)
        s = self.s
        if self.latih:
            # skala acak 0,75-1,5 lalu potong acak s x s (Subbab 3.2.3)
            k = random.uniform(0.75, 1.5) * s / min(img.shape[:2])
            img = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_LINEAR)
            mask = cv2.resize(mask, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
            ph, pw = max(0, s - img.shape[0]), max(0, s - img.shape[1])
            if ph or pw:
                img = cv2.copyMakeBorder(img, 0, ph, 0, pw, cv2.BORDER_CONSTANT, value=0)
                mask = cv2.copyMakeBorder(mask, 0, ph, 0, pw, cv2.BORDER_CONSTANT, value=ABAIKAN)
            y = random.randint(0, img.shape[0] - s)
            x = random.randint(0, img.shape[1] - s)
            img, mask = img[y:y + s, x:x + s], mask[y:y + s, x:x + s]
            if random.random() < 0.5:
                img, mask = img[:, ::-1], mask[:, ::-1]
            if random.random() < 0.5:
                img, mask = img[::-1], mask[::-1]
            # variasi cahaya: kecerahan, kontras, saturasi, sedikit blur (lensa kotor)
            f = img.astype(np.float32)
            f = (f - f.mean()) * random.uniform(0.75, 1.25) + f.mean() * random.uniform(0.75, 1.25)
            abu = f.mean(2, keepdims=True)
            f = abu + (f - abu) * random.uniform(0.7, 1.3)
            img = np.clip(f, 0, 255).astype(np.uint8)
            if random.random() < 0.15:
                img = cv2.GaussianBlur(img, (0, 0), random.uniform(0.6, 1.6))
        else:
            img = cv2.resize(img, (s, s), interpolation=cv2.INTER_LINEAR)
            mask = cv2.resize(mask, (s, s), interpolation=cv2.INTER_NEAREST)
        x = (img.astype(np.float32) / 255.0 - MEAN) / STD
        return torch.from_numpy(x.transpose(2, 0, 1).copy()), torch.from_numpy(mask.astype(np.int64).copy())


def bobot_kelas(folder: Path, baris: list[dict]) -> torch.Tensor:
    """alpha_c = kebalikan frekuensi piksel, dinormalisasi (Persamaan 3.3)."""
    n = np.zeros(C)
    for r in baris:
        m = np.array(Image.open(folder / "masker" / f"{r['foto']}.png"))
        n += np.bincount(m[m != ABAIKAN].ravel(), minlength=C)[:C]
    frek = n / max(n.sum(), 1)
    a = 1.0 / np.maximum(frek, 1e-3)
    a = a / a.sum() * C
    return torch.tensor(np.clip(a, 0.2, 10.0), dtype=torch.float32)


# ---------------------------------------------------------------- kerugian
class FocalDice(nn.Module):
    """L_total = L_Focal + lambda * L_Dice (Persamaan 3.2-3.4)."""

    def __init__(self, alpha: torch.Tensor, gamma: float = 2.0, lam: float = 1.0, eps: float = 1.0):
        super().__init__()
        self.register_buffer("alpha", alpha)
        self.gamma, self.lam, self.eps = gamma, lam, eps

    def forward(self, logit: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        sah = target != ABAIKAN
        t = torch.where(sah, target, torch.zeros_like(target))
        logp = F.log_softmax(logit, 1)
        p = logp.exp()
        g = F.one_hot(t, C).permute(0, 3, 1, 2).float() * sah[:, None]
        focal = -(self.alpha[None, :, None, None] * g * (1 - p) ** self.gamma * logp).sum(1)
        focal = focal[sah].mean() if sah.any() else logit.sum() * 0
        p = p * sah[:, None]
        inter = (p * g).sum((0, 2, 3))
        dice = 1 - ((2 * inter + self.eps) / ((p ** 2).sum((0, 2, 3)) + (g ** 2).sum((0, 2, 3)) + self.eps)).mean()
        return focal + self.lam * dice


# ---------------------------------------------------------------- model
def buat_model(encoder: str, bobot: str):
    import segmentation_models_pytorch as smp

    return smp.DeepLabV3Plus(encoder_name=encoder, encoder_weights=None if bobot == "none" else bobot, classes=C)


@torch.no_grad()
def miou_dari(cm: np.ndarray) -> float:
    tp = np.diag(cm).astype(float)
    denom = cm.sum(0) + cm.sum(1) - tp
    ada = cm.sum(1) > 0
    iou = np.where(denom > 0, tp / np.maximum(denom, 1), np.nan)
    return float(np.nanmean(iou[ada]))


def bootstrap_ci(cm_unit: list, galat_unit: np.ndarray, ulang: int = 2000, seed: int = 2026) -> dict:
    """Selang kepercayaan 95% bootstrap berkelompok: unit (muatan) diambil ulang, bukan foto."""
    acak = np.random.default_rng(seed)
    n = len(cm_unit)
    cm_unit = np.array(cm_unit)
    mi, ma = [], []
    for _ in range(ulang):
        idx = acak.integers(0, n, n)
        mi.append(miou_dari(cm_unit[idx].sum(0)))
        ma.append(float(galat_unit[idx].mean()))
    q = lambda v: [round(float(np.percentile(v, 2.5)), 4), round(float(np.percentile(v, 97.5)), 4)]
    return {"ulangan": ulang, "miou_ci95": q(mi), "mae_proporsi_ci95_pp": q(ma)}


def evaluasi(model, ds: DataSampah, perangkat, bootstrap: bool = False) -> dict:
    """Matriks kebingungan, IoU, mIoU, dan MAE proporsi per muatan (Tabel 3.10, Persamaan 3.27)."""
    model.eval()
    cm = np.zeros((C, C), np.int64)
    cm_unit: dict[str, np.ndarray] = {}
    prop: dict[str, list] = {}
    for i in range(len(ds)):
        x, y = ds[i]
        pr = model(x[None].to(perangkat)).argmax(1)[0].cpu().numpy()
        y = y.numpy()
        sah = y != ABAIKAN
        cm_f = np.bincount(C * y[sah] + pr[sah], minlength=C * C).reshape(C, C)
        cm += cm_f
        u = ds.baris[i]["id_muatan"]
        cm_unit[u] = cm_unit.get(u, 0) + cm_f
        def proporsi(m):
            n = np.bincount(m[sah].ravel(), minlength=C)[1:].astype(float)
            return n / max(n.sum(), 1)
        prop.setdefault(ds.baris[i]["id_muatan"], []).append((proporsi(pr), proporsi(y)))
    tp = np.diag(cm).astype(float)
    denom = cm.sum(0) + cm.sum(1) - tp
    ada = cm.sum(1) > 0
    iou = np.where(denom > 0, tp / np.maximum(denom, 1), np.nan)
    galat = []
    for v in prop.values():  # rata-rata frame per muatan (Persamaan 3.5), lalu bandingkan
        p = np.mean([a for a, _ in v], 0)
        t = np.mean([b for _, b in v], 0)
        galat.append(np.abs(p - t) * 100)
    galat = np.array(galat)
    hasil_ci = bootstrap_ci([cm_unit[u] for u in prop], galat.mean(1)) if bootstrap and len(galat) > 1 else None
    return {
        "miou": float(np.nanmean(iou[ada])),
        "iou_per_kelas": {KELAS[c]: (None if np.isnan(iou[c]) else round(float(iou[c]), 4)) for c in range(C)},
        "akurasi_piksel": float(tp.sum() / max(cm.sum(), 1)),
        "mae_proporsi_pp": float(galat.mean()) if len(galat) else None,
        "mae_proporsi_per_fraksi_pp": {KELAS[c + 1]: round(float(galat[:, c].mean()), 3) for c in range(C - 1)} if len(galat) else {},
        "jumlah_muatan": len(prop),
        "jumlah_frame": len(ds),
        "matriks_kebingungan": cm.tolist(),
        **({"bootstrap": hasil_ci} if hasil_ci else {}),
    }


def latih_satu(folder, latih_b, val_b, a, perangkat, catat=None, awal=None, epoch=None):
    """Latih satu model. val_b kosong = latih tepat `epoch` epoch tanpa berhenti dini (model final)."""
    model = buat_model(a.encoder, a.bobot).to(perangkat)
    if awal is not None:  # bobot hasil pralatih ZeroWaste-f/TACO (Subbab 3.1.6)
        model.load_state_dict(awal)
    n_epoch = epoch or a.epoch
    kerugian = FocalDice(bobot_kelas(folder, latih_b)).to(perangkat)
    enc = list(model.encoder.parameters())
    id_enc = {id(p) for p in enc}
    lain = [p for p in model.parameters() if id(p) not in id_enc]
    opt = torch.optim.AdamW([{"params": enc, "lr": a.lr_encoder}, {"params": lain, "lr": a.lr_decoder}], weight_decay=1e-4)
    # drop_last: batch berisi 1 citra membuat BatchNorm gagal
    dl = DataLoader(DataSampah(folder, latih_b, a.ukuran, True), batch_size=max(2, min(a.batch, len(latih_b))), shuffle=True, num_workers=a.pekerja, drop_last=True)
    total = n_epoch * max(1, len(dl))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda it: (1 - min(it, total - 1) / total) ** 0.9)
    ds_val = DataSampah(folder, val_b, a.ukuran, False) if val_b else None
    terbaik, keadaan, sabar, ep_terbaik = -1.0, None, 0, n_epoch
    for ep in range(1, n_epoch + 1):
        model.train()
        t0, jml = time.time(), 0.0
        for x, y in dl:
            x, y = x.to(perangkat), y.to(perangkat)
            loss = kerugian(model(x), y)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            jml += loss.item()
        if ds_val is None:
            baris = {"epoch": ep, "loss": round(jml / max(1, len(dl)), 4), "detik": round(time.time() - t0, 1)}
            print(baris, flush=True)
            if catat is not None:
                catat.append(baris)
            continue
        ev = evaluasi(model, ds_val, perangkat)
        baris = {"epoch": ep, "loss": round(jml / max(1, len(dl)), 4), "miou_val": round(ev["miou"], 4), "mae_proporsi_val": round(ev["mae_proporsi_pp"] or 0, 3), "detik": round(time.time() - t0, 1)}
        print(baris, flush=True)
        if catat is not None:
            catat.append(baris)
        if ev["miou"] > terbaik:
            terbaik, sabar, ep_terbaik = ev["miou"], 0, ep
            keadaan = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        else:
            sabar += 1
            if sabar >= a.sabar:
                print(f"berhenti dini pada epoch {ep}")
                break
    if keadaan is not None:
        model.load_state_dict(keadaan)
    model.epoch_terbaik = ep_terbaik
    return model


# ---------------------------------------------------------------- ekspor
class Ekspor(nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, x):
        return torch.softmax(self.m(x), 1)


def ekspor_onnx(model, a, keluar: Path, folder: Path, contoh: list[dict]) -> dict:
    eks = Ekspor(model.cpu()).eval()
    x = torch.randn(1, 3, a.ukuran, a.ukuran)
    jalur = keluar / "karta-seg.onnx"
    try:
        torch.onnx.export(eks, x, str(jalur), input_names=["masukan"], output_names=["prob"], opset_version=17, dynamo=False)
    except TypeError:  # PyTorch lama belum punya argumen dynamo
        torch.onnx.export(eks, x, str(jalur), input_names=["masukan"], output_names=["prob"], opset_version=17)
    import onnxruntime as ort

    sesi = ort.InferenceSession(str(jalur), providers=["CPUExecutionProvider"])
    beda = float(np.abs(sesi.run(None, {"masukan": x.numpy()})[0] - eks.eval()(x).detach().numpy()).max())
    info = {"onnx": jalur.name, "ukuran_mb": round(jalur.stat().st_size / 1e6, 2), "beda_maks_torch_onnx": beda}
    if a.kuantisasi:
        from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static
        from onnxruntime.quantization.shape_inference import quant_pre_process

        class Kalib(CalibrationDataReader):
            def __init__(self):
                ds = DataSampah(folder, contoh[:32], a.ukuran, False)
                self.it = iter([{"masukan": ds[i][0][None].numpy()} for i in range(len(ds))])

            def get_next(self):
                return next(self.it, None)

        pra = keluar / "pra.onnx"
        quant_pre_process(str(jalur), str(pra))
        j8 = keluar / "karta-seg-int8.onnx"
        quantize_static(str(pra), str(j8), Kalib(), quant_format=QuantFormat.QDQ, activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8, per_channel=True)
        pra.unlink()
        s8 = ort.InferenceSession(str(j8), providers=["CPUExecutionProvider"])
        ds = DataSampah(folder, contoh[:16], a.ukuran, False)
        setuju = np.mean([(s8.run(None, {"masukan": ds[i][0][None].numpy()})[0].argmax(1) == sesi.run(None, {"masukan": ds[i][0][None].numpy()})[0].argmax(1)).mean() for i in range(len(ds))])
        info.update({"onnx_int8": j8.name, "ukuran_int8_mb": round(j8.stat().st_size / 1e6, 2), "kesesuaian_piksel_int8_vs_fp32": round(float(setuju), 4)})
    # ukur waktu inferensi CPU
    t0 = time.time()
    for _ in range(5):
        sesi.run(None, {"masukan": x.numpy()})
    info["ms_per_frame_cpu_pelatih"] = round((time.time() - t0) / 5 * 1000, 1)
    return info


def gambar_kebingungan(cm, jalur: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cm = np.array(cm, float)
    nor = cm / np.maximum(cm.sum(1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(6.4, 5.4))
    ax.imshow(nor, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(C), NAMA, rotation=40, ha="right")
    ax.set_yticks(range(C), NAMA)
    for i in range(C):
        for j in range(C):
            ax.text(j, i, f"{nor[i, j]:.2f}", ha="center", va="center", fontsize=8, color="white" if nor[i, j] > 0.5 else "black")
    ax.set_xlabel("Prediksi")
    ax.set_ylabel("Label")
    ax.set_title("Matriks kebingungan (dinormalisasi per baris)")
    fig.tight_layout()
    fig.savefig(jalur, dpi=150)
    plt.close(fig)


# ---------------------------------------------------------------- utama
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="folder berisi gambar/, masker/, meta.csv")
    ap.add_argument("--pralatih", default=None, help="(opsional) folder data pralatih, mis. TACO, dilatih lebih dulu")
    ap.add_argument("--keluar", required=True)
    ap.add_argument("--encoder", default="resnet50")
    ap.add_argument("--bobot", default="imagenet", help="imagenet | none")
    ap.add_argument("--ukuran", type=int, default=512)
    ap.add_argument("--epoch", type=int, default=80)
    ap.add_argument("--epoch-pralatih", type=int, default=20)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr-encoder", type=float, default=1e-4)
    ap.add_argument("--lr-decoder", type=float, default=1e-3)
    ap.add_argument("--sabar", type=int, default=10)
    ap.add_argument("--cv", type=int, default=0, help="jumlah lipatan validasi silang (0 = lewati); lipatan dibaca dari meta.csv bila ada")
    ap.add_argument("--lolo", action="store_true", help="validasi tinggalkan-satu-lokasi (kolom tps)")
    ap.add_argument("--selalu-latih", nargs="*", default=["Campuran"], help="lokasi yang selalu ikut dilatih pada --lolo (campuran buatan D4)")
    ap.add_argument("--porsi-uji", type=float, default=0.15)
    ap.add_argument("--pekerja", type=int, default=2)
    ap.add_argument("--kuantisasi", action="store_true")
    ap.add_argument("--label-data", default="foto-tim", help="keterangan sumber data, ditulis ke meta model")
    ap.add_argument("--seed", type=int, default=2026)
    a = ap.parse_args()
    seed_all(a.seed)
    perangkat = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    folder, keluar = Path(a.data), Path(a.keluar)
    keluar.mkdir(parents=True, exist_ok=True)
    meta = baca_meta(folder)
    grup = np.array([r["id_muatan"] for r in meta])
    print(f"{len(meta)} frame dari {len(set(grup))} muatan; perangkat {perangkat}")

    # 1) set uji per muatan (Subbab 3.3). Disarankan: jalankan buat_split.py sekali agar pembagian beku.
    if any(r.get("set") == "uji" for r in meta):
        uji_i = [i for i, r in enumerate(meta) if r.get("set") == "uji"]
    else:
        print("PERINGATAN: meta.csv belum punya kolom set; set uji diambil acak per muatan. Jalankan buat_split.py.")
        gss = GroupShuffleSplit(n_splits=1, test_size=a.porsi_uji, random_state=a.seed)
        _, uji_i = next(gss.split(meta, groups=grup))
    uji_set = set(int(i) for i in uji_i)
    sisa = [meta[i] for i in range(len(meta)) if i not in uji_set]
    uji = [meta[i] for i in sorted(uji_set)]
    assert not ({r["id_muatan"] for r in sisa} & {r["id_muatan"] for r in uji}), "kebocoran: muatan uji ada di data latih"
    g_sisa = np.array([r["id_muatan"] for r in sisa])
    lok_sisa = np.array([r.get("tps") or "?" for r in sisa])
    teks_split = "\n".join(f"{r['foto']},{r['id_muatan']},{r.get('set', '')},{r.get('lipatan', '')}" for r in sorted(meta, key=lambda r: r["foto"]))

    hasil: dict = {"tanggal": datetime.now(timezone.utc).isoformat(timespec="seconds"), "argumen": vars(a), "perangkat": str(perangkat),
                   "data": {"frame": len(meta), "muatan": int(len(set(grup))), "frame_uji": len(uji), "muatan_uji": len({r['id_muatan'] for r in uji}),
                            "lokasi": sorted(set(lok_sisa.tolist())), "sha256_pembagian": hashlib.sha256(teks_split.encode()).hexdigest()}}

    # 2) pralatih pada dataset publik (opsional, Subbab 3.1.6); bobotnya menjadi titik awal semua model berikut
    awal = None
    if a.pralatih:
        pm = baca_meta(Path(a.pralatih))
        print(f"--- pralatih {len(pm)} frame dari {a.pralatih}")
        m0 = latih_satu(Path(a.pralatih), pm, [], a, perangkat, epoch=a.epoch_pralatih)
        awal = {k: v.detach().cpu().clone() for k, v in m0.state_dict().items()}
        torch.save(awal, keluar / "pralatih.pt")

    def ringkas(daftar: list) -> dict:
        mi = np.array([x["miou"] for x in daftar])
        ma = np.array([x["mae_proporsi_pp"] for x in daftar])
        sb = lambda v: float(v.std(ddof=1)) if len(v) > 1 else 0.0
        return {"miou_rerata": float(mi.mean()), "miou_sb": sb(mi), "mae_proporsi_rerata_pp": float(ma.mean()), "mae_proporsi_sb_pp": sb(ma)}

    # 3) validasi silang berstrata per lokasi, kelompok = muatan (lipatan dari buat_split.py bila ada)
    epoch_terbaik: list[int] = []
    if a.cv and a.cv > 1:
        if all(r.get("lipatan", "") != "" for r in sisa):
            lip = np.array([int(r["lipatan"]) for r in sisa])
            pecahan = [(np.where(lip != f)[0], np.where(lip == f)[0]) for f in sorted(set(lip.tolist()))]
        else:
            pecahan = list(StratifiedGroupKFold(n_splits=a.cv, shuffle=True, random_state=a.seed).split(np.zeros(len(sisa)), lok_sisa, g_sisa))
        lipatan = []
        for f, (li, vi) in enumerate(pecahan):
            print(f"--- lipatan {f + 1}/{len(pecahan)}")
            m = latih_satu(folder, [sisa[i] for i in li], [sisa[i] for i in vi], a, perangkat, awal=awal)
            epoch_terbaik.append(m.epoch_terbaik)
            ev = evaluasi(m, DataSampah(folder, [sisa[i] for i in vi], a.ukuran, False), perangkat)
            lipatan.append({k: ev[k] for k in ("miou", "mae_proporsi_pp", "akurasi_piksel", "iou_per_kelas")} | {"epoch_terbaik": m.epoch_terbaik, "muatan": ev["jumlah_muatan"]})
        hasil["validasi_silang"] = {"lipatan": lipatan, **ringkas(lipatan)}

    # 4) validasi tinggalkan-satu-lokasi (opsional)
    if a.lolo and len(set(lok_sisa.tolist())) > 1:
        lolo = {}
        for lok in sorted(set(lok_sisa.tolist())):
            if lok in a.selalu_latih:
                continue
            li, vi = np.where(lok_sisa != lok)[0], np.where(lok_sisa == lok)[0]
            print(f"--- tinggalkan lokasi {lok}")
            m = latih_satu(folder, [sisa[i] for i in li], [sisa[i] for i in vi], a, perangkat, awal=awal)
            ev = evaluasi(m, DataSampah(folder, [sisa[i] for i in vi], a.ukuran, False), perangkat)
            lolo[lok] = {k: ev[k] for k in ("miou", "mae_proporsi_pp", "iou_per_kelas")} | {"muatan": ev["jumlah_muatan"]}
        hasil["tinggalkan_satu_lokasi"] = {"per_lokasi": lolo, **ringkas(list(lolo.values()))}

    # 5) model akhir: dilatih pada SEMUA data pengembangan selama median epoch terbaik validasi silang.
    #    Tanpa validasi silang: satu lipatan disisihkan untuk berhenti dini.
    kurva: list = []
    print("--- model akhir")
    if epoch_terbaik:
        n_ep = int(np.median(epoch_terbaik))
        hasil["epoch_model_akhir"] = n_ep
        model = latih_satu(folder, sisa, [], a, perangkat, kurva, awal=awal, epoch=n_ep)
    else:
        li, vi = next(GroupKFold(n_splits=max(2, min(5, len(set(g_sisa))))).split(sisa, groups=g_sisa))
        model = latih_satu(folder, [sisa[i] for i in li], [sisa[i] for i in vi], a, perangkat, kurva, awal=awal)
    torch.save(model.state_dict(), keluar / "model.pt")
    ev_uji = evaluasi(model, DataSampah(folder, uji, a.ukuran, False), perangkat, bootstrap=True)
    hasil["uji_akhir"] = ev_uji
    hasil["kurva"] = kurva
    gambar_kebingungan(ev_uji["matriks_kebingungan"], keluar / "matriks_kebingungan.png")

    # 4) ekspor untuk aplikasi
    hasil["ekspor"] = ekspor_onnx(model, a, keluar, folder, sisa)
    meta_model = {
        "nama": f"KARTA-Seg DeepLabv3+ {a.encoder}",
        "versi": datetime.now().strftime("%Y%m%d-%H%M"),
        "arsitektur": "DeepLabv3+",
        "encoder": a.encoder,
        "kelas": KELAS,
        "nama_kelas": NAMA,
        "warna": [list(w) for w in WARNA],
        "ukuran_masukan": [a.ukuran, a.ukuran],
        "mean": MEAN.tolist(),
        "std": STD.tolist(),
        "berkas": hasil["ekspor"].get("onnx_int8", "karta-seg.onnx") if hasil["ekspor"].get("kesesuaian_piksel_int8_vs_fp32", 0) >= 0.97 else "karta-seg.onnx",
        "masukan": "masukan",
        "keluaran": "prob",
        "sumber_data": a.label_data,
        "metrik_uji": {"miou": round(ev_uji["miou"], 4), "mae_proporsi_pp": round(ev_uji["mae_proporsi_pp"] or 0, 3), "muatan_uji": ev_uji["jumlah_muatan"]},
    }
    (keluar / "karta-seg.json").write_text(json.dumps(meta_model, indent=1, ensure_ascii=False), encoding="utf-8")
    (keluar / "evaluasi.json").write_text(json.dumps(hasil, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
    print(json.dumps({"uji_akhir": {k: ev_uji.get(k) for k in ("miou", "mae_proporsi_pp", "iou_per_kelas", "bootstrap")}, "ekspor": hasil["ekspor"]}, indent=1))
    print(f"Selesai. Salin {keluar}/karta-seg.onnx (atau -int8) dan karta-seg.json ke karta-mobile/public/models/")


if __name__ == "__main__":
    main()
