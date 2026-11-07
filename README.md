# SORA

Sistem Observasi, Rekomendasi, dan Analisis Sampah Berbasis Computer Vision untuk Identifikasi Komposisi, Prediksi Kadar Air, dan Estimasi Nilai Kalor serta Penentuan Jalur Pengolahan di PLTSa Putri Cempo, Surakarta.

Prototipe Next.js + React dengan antarmuka ponsel berbahasa Indonesia. Lebar aplikasi dibatasi 460 px pada layar besar. Desain mengacu pada `the-design.png`; emblem asli dipindahkan dan dinamai `public/logo.svg`.

## Menjalankan

```sh
npm install
npm run dev
```

Buka http://localhost:3000. Gunakan **Coba demo**, QR kartu contoh, atau ID dan kata sandi sembarang yang tidak kosong. Tidak ada autentikasi sungguhan; jangan gunakan kredensial nyata.

Tombol Google membuka simulasi masuk. OAuth Google belum terhubung dan tidak meminta atau memverifikasi akun Google.

```sh
npm run test        # 24 uji unit: rumus lampiran, aturan rute, mutu citra, hujan
npm run typecheck
npm run build
npm start
```

Untuk pemeriksaan peramban, jalankan `npx playwright install chromium`, nyalakan aplikasi pada port 3000, lalu `npm run test:e2e`. Tangkapan layar hasil pemeriksaan tersimpan di `artifacts/`.

## Deploy ke Vercel

Unggah proyek ke repositori Git, lalu impor repositori di Vercel. Pilih framework **Next.js**, direktori root proyek ini, dan perintah build `npm run build`. Tidak membutuhkan environment variable, database, maupun API key. Proyek ini belum dipublikasikan.

## Prediksi AI di HP

Pemindaian tidak lagi memakai angka simulasi. Setiap bagian muatan dianalisis langsung di HP:

1. **Sumber gambar**: Kamera HP (kamera belakang, butuh https), Unggah video, Foto, atau Video contoh konveyor.
2. **Mutu citra** (`lib/karta/kualitas.ts`): ketajaman (varians Laplacian) dan kecerahan. Lensa kotor, gelap, atau silau memunculkan peringatan.
3. **Segmentasi** (`lib/karta/segmentasi.ts`): model DeepLabv3+ format ONNX dijalankan dengan ONNX Runtime Web (WebAssembly) pada 5 frame. Hasilnya overlay warna fraksi di layar.
4. **Taksiran** (`lib/karta/estimasi.ts`): luas → massa (Pers. 3.8), kadar air fisika (3.9), koreksi hujan (3.11), rentang 80% (3.12), LHV (3.15–3.17), aturan rute U/B/M/R (Tabel 3.7), dosis serbuk kayu (3.19). Nomor persamaan merujuk ke lampiran laporan.
5. **Hujan** (`lib/karta/cuaca.ts`): curah hujan 24 dan 72 jam dari Open-Meteo saat mencatat muatan (lokasi HP, atau Surakarta bila izin ditolak). Bisa diisi manual.

Model dibaca dari `public/models/karta-seg.json` + berkas ONNX, dan model kadar air dari `public/models/kadar-air.json`.
Bila model tidak dapat dimuat, petugas tetap bisa memakai data simulasi (diberi label).
Model yang saat ini terpasang adalah **model versi uji** dari data sintetis; ganti dengan hasil `training/` (lihat `training/README.md`).
`npm install` menyalin berkas ONNX Runtime ke `public/ort/` (skrip `scripts/salin-ort.mjs`).

## Alur

1. Masuk dan catat TPS asal, pelat, berat bersih, serta ukuran bagian (1-500 kg). Pindai ID petugas TPS dengan kartu contoh; identitas disimpan bersama muatan dan laporan CSV. TPS asal dan pelat tetap diketik manual.
2. Tekan Mulai analisis untuk tiap bagian. Latar `trash_conveyor_horizontal_final.mp4` diputar sekitar satu detik lalu dijeda selama analisis. Pemindaian berikutnya melanjutkan posisi video sebelumnya. Jika video tidak dapat dimuat atau diputar, placeholder muncul dan simulasi tetap berjalan. Berat bagian terakhir mengikuti sisa berat. Contoh 1.200 kg dibagi 500 + 500 + 200 kg.
3. Periksa enam fraksi, kadar air dengan rentang 80%, nilai kalor, dan alasan rekomendasi. Pilih rute U/B/M/R. Perubahan rute membutuhkan alasan minimal 10 karakter, disimpan bersama rekomendasi awal.
4. Catat semua bagian lalu selesaikan muatan. Ringkasan menampilkan berat per tujuan dan rincian setiap bagian. Pilih format CSV atau PDF di ringkasan muatan, atau melalui tombol unduh pada halaman Riwayat untuk seluruh muatan selesai. CSV memakai pemisah titik koma untuk pengolahan lanjutan. PDF A4 memuat ringkasan, distribusi rute, identitas muatan, komposisi dan hasil analisis per bagian, rekomendasi, keputusan petugas, serta peringatan yang tersedia; tabel berlanjut otomatis ke halaman berikutnya. Data opsional yang belum tercatat ditandai “Tidak tersedia”.

Aturan rute (lampiran Tabel 3.7): R jika inert ≥20%; U jika batas atas kadar air ≤20%; M jika kadar air ≥60%, organik ≥60%, dan plastik ≤5%; B jika kadar air <65% (dosis serbuk kayu 10–20% dihitung dari neraca massa air); selain itu R. Ini aturan per bagian, bukan solver MILP harian. Sebelum ada uji oven, rentang kadar air memakai lebar bawaan ±10 poin dan diberi peringatan.

Kamera QR, timbangan, kontrol palang/konveyor, serta panggilan bantuan tidak terhubung ke perangkat atau layanan nyata. Tombol bantuan menunjukkan kontak belum dikonfigurasi dan menyediakan simulasi tanpa mengirim pesan. Pengukuran asli memerlukan sampel, kalibrasi uji oven, massa aktual tiap bagian, pemeriksaan kontaminan, dan persetujuan pengawas sesuai SOP.

Riwayat awal berisi satu muatan contoh 1.000 kg. Data dan sesi demo disimpan di localStorage (`karta-prototype-v1`), hanya pada peramban tersebut. Tidak ada sinkronisasi atau pengiriman data. Google Fonts dimuat dari internet dengan cadangan font sistem. Hapus data situs di peramban untuk mengatur ulang demo.
