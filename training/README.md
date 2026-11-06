# Pelatihan model SORA

Folder ini berisi semua yang dibutuhkan untuk melatih dan mengevaluasi model yang dipakai aplikasi petugas.
Rumus dan pengaturan mengikuti lampiran laporan Bab 3.

| Berkas | Fungsi |
|---|---|
| `karta_kelas.py` | Daftar 7 kelas (urutan sama dengan aplikasi), nama label LabelMe yang dikenali, pemetaan TACO |
| `labelme_ke_mask.py` | Anotasi poligon LabelMe → masker PNG + `meta.csv` (ID muatan dari nama file) |
| `taco_ke_karta.py` | (Opsional) dataset publik TACO → masker SORA, khusus pralatih |
| `zerowaste_ke_karta.py` | (Opsional) ZeroWaste-f (1.245 frame latih, CC BY-NC 4.0) → masker SORA, khusus pralatih |
| `buat_split.py` | Membekukan pembagian data: set uji akhir berstrata per lokasi + 5 lipatan StratifiedGroupKFold, mencetak SHA-256 |
| `buat_data_sintetis.py` | Data tekstur buatan untuk menguji alur. **Bukan foto sampah** |
| `latih.py` | DeepLabv3+, Focal + Dice, validasi silang per muatan, tinggalkan-satu-lokasi, selang bootstrap, ekspor ONNX (+INT8) |
| `kalibrasi_kadar_air.py` | Model kadar air hibrida (fisika + ridge) dan rentang Jackknife+ dari data uji oven |
| `notebook/SORA_Latih_DeepLabv3plus.ipynb` | Notebook Google Colab (GPU T4) yang menjalankan semua langkah di atas |
| `templat/` | Contoh `meta.csv` foto dan `uji_oven.csv` |

## Alur singkat

1. Foto sampah (bukan truk) dari TPS atau campuran laboratorium. Nama file `M001_PasarKudus_f01.jpg`.
2. Anotasi poligon di LabelMe dengan label `organik`, `plastik`, `kertas`, `tekstil`, `kayu`, `inert`, atau `abaikan`.
3. Jalankan `buat_split.py` **sekali** untuk membekukan pembagian data, catat SHA-256-nya. Lalu jalankan notebook di Colab. Hasilnya `karta-seg.json`, `karta-seg(-int8).onnx`, `evaluasi.json`, `matriks_kebingungan.png`.
4. Salin `karta-seg.json` dan berkas ONNX yang tertulis pada kolom `berkas` ke `public/models/`, lalu deploy ulang.
5. Setelah ada uji oven (≥ 30 muatan), jalankan `kalibrasi_kadar_air.py` dan salin `kadar-air.json` ke `public/models/`.

## Metrik yang dilaporkan (`evaluasi.json`)

- `iou_per_kelas`, `miou`: ketepatan batas piksel tiap kelas (target mIoU ≥ 0,55).
- `mae_proporsi_pp`: selisih rata-rata proporsi fraksi per muatan dalam poin persen (target ≤ 3). Ini ukuran yang langsung memengaruhi taksiran kadar air.
- `matriks_kebingungan`: kelas yang sering tertukar.
- `validasi_silang`: rata-rata ± simpangan baku dari 5 lipatan (bila `--cv` dipakai).
- `tinggalkan_satu_lokasi`: kinerja pada lokasi yang tidak ikut dilatih (bila `--lolo` dipakai).
- `uji_akhir.bootstrap`: selang kepercayaan 95% mIoU dan MAE proporsi, bootstrap 2.000 kali per muatan.
- `data.sha256_pembagian`: sidik jari pembagian data, untuk membuktikan semua eksperimen memakai pembagian yang sama.
- `ekspor`: ukuran berkas, selisih Torch vs ONNX, kesesuaian INT8 vs FP32, waktu per frame.

Set uji dipisah **per muatan**, sehingga foto dari muatan yang sama tidak pernah muncul di data latih dan data uji sekaligus.
Rencana jumlah data tahap 1 (lampiran Tabel 3.5): 96 unit (4 lokasi × 18 muatan nyata + 24 campuran buatan), 480 foto berlabel,
60 unit uji oven. Set uji akhir 18 unit (90 foto); data pengembangan 78 unit (390 foto) dalam 5 lipatan.
Kolom `tps` dipakai sebagai lokasi; beri nilai `Campuran` untuk campuran buatan (D4) dan kolom `oven` = 1 untuk unit yang diuji oven.

## Model yang saat ini ada di `public/models/`

Model saat ini adalah **model uji alur**: DeepLabv3+ dengan encoder MobileNetV2 yang dilatih di CPU dari data sintetis
(`buat_data_sintetis.py`). Model ini membuktikan bahwa alur latih → ONNX → aplikasi HP berjalan, tetapi **belum mengenali
sampah nyata**. Aplikasi menandainya dengan label "UJI ALUR". Ganti dengan model dari foto tim sebelum dipakai untuk evaluasi.
