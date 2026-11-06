"""Daftar kelas KARTA dan pemetaan label.

Urutan kelas WAJIB sama dengan aplikasi (lib/karta/konstanta.ts) dan
Tabel 3.3 lampiran: 0 latar, 1 organik basah, 2 plastik, 3 kertas dan kardus,
4 tekstil, 5 kayu dan ranting, 6 inert. Nilai 255 = abaikan (tidak dihitung).
"""
from __future__ import annotations

KELAS = ["latar", "organik_basah", "plastik", "kertas_kardus", "tekstil", "kayu_ranting", "inert"]
NAMA = ["Latar", "Organik basah", "Plastik", "Kertas dan kardus", "Tekstil", "Kayu dan ranting", "Inert"]
ABAIKAN = 255
# Warna overlay (RGB), sama dengan aplikasi.
WARNA = [(40, 48, 61), (17, 167, 146), (82, 125, 240), (231, 179, 75), (176, 155, 232), (184, 137, 99), (155, 168, 186)]

# Nama label yang boleh dipakai saat anotasi di LabelMe/CVAT (huruf kecil).
ALIAS = {
    "latar": 0, "background": 0, "konveyor": 0, "lantai": 0, "bak": 0,
    "organik": 1, "organik_basah": 1, "organik basah": 1, "sisa makanan": 1, "sayur": 1, "buah": 1, "daun segar": 1,
    "plastik": 2, "kresek": 2, "botol plastik": 2, "saset": 2, "styrofoam": 2,
    "kertas": 3, "kardus": 3, "kertas_kardus": 3, "kertas dan kardus": 3, "karton": 3,
    "tekstil": 4, "kain": 4, "pakaian": 4, "popok": 4,
    "kayu": 5, "ranting": 5, "kayu_ranting": 5, "kayu dan ranting": 5, "bambu": 5, "daun kering": 5,
    "inert": 6, "residu": 6, "batu": 6, "tanah": 6, "pasir": 6, "kaca": 6, "logam": 6, "kaleng": 6, "keramik": 6,
    "abaikan": ABAIKAN, "ignore": ABAIKAN, "ragu": ABAIKAN,
}


def kelas_dari_label(label: str) -> int | None:
    """Ubah nama label anotasi menjadi indeks kelas. None = tidak dikenal."""
    return ALIAS.get(label.strip().lower().replace("-", " ").replace("  ", " "))


def kelas_taco(nama: str, super_kategori: str) -> int:
    """Pemetaan 60 kategori TACO ke kelas KARTA (dipakai hanya untuk pralatih).

    TACO berisi sampah kering di alam terbuka, sehingga kelas organik basah,
    kayu, dan inert tanah/batu hampir tidak ada. Hasil pralatih TACO tetap
    wajib di-fine-tune dengan foto tim.
    """
    n = f"{nama} {super_kategori}".lower()
    if "food" in n:
        return 1
    if "cigarette" in n or "unlabeled" in n:
        return ABAIKAN
    if "glass" in n or "metal" in n or "alumin" in n or "can" in n.split() or "pop tab" in n or "battery" in n or "foil" in n:
        return 6
    if "paper" in n or "carton" in n or "cardboard" in n or "tissue" in n or "magazine" in n or "toilet tube" in n:
        return 3
    if "rope" in n or "string" in n or "shoe" in n:
        return 4
    return 2  # sisanya kemasan dan benda plastik
