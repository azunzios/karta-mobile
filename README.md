# KARTA

Prototipe Next.js + React dengan antarmuka ponsel berbahasa Indonesia. Lebar aplikasi dibatasi 460 px pada layar besar. Desain mengacu pada `the-design.png`; emblem asli dipindahkan dan dinamai `public/logo.svg`.

## Menjalankan

```sh
npm install
npm run dev
```

Buka http://localhost:3000. Gunakan **Coba demo**, QR kartu contoh, atau ID dan kata sandi sembarang yang tidak kosong. Tidak ada autentikasi sungguhan; jangan gunakan kredensial nyata.

Tombol Google membuka simulasi masuk. OAuth Google belum terhubung dan tidak meminta atau memverifikasi akun Google.

```sh
npm run test
npm run typecheck
npm run build
npm start
```

Untuk pemeriksaan peramban, jalankan `npx playwright install chromium`, nyalakan aplikasi pada port 3000, lalu `npm run test:e2e`. Tangkapan layar hasil pemeriksaan tersimpan di `artifacts/`.

## Deploy ke Vercel

Unggah proyek ke repositori Git, lalu impor repositori di Vercel. Pilih framework **Next.js**, direktori root proyek ini, dan perintah build `npm run build`. Tidak membutuhkan environment variable, database, maupun API key. Proyek ini belum dipublikasikan.

## Alur

1. Masuk dan catat TPS asal, pelat, berat bersih, serta ukuran bagian (1-500 kg). Pindai ID petugas TPS dengan kartu contoh; identitas disimpan bersama muatan dan laporan CSV. TPS asal dan pelat tetap diketik manual.
2. Pindai contoh tiap bagian. Latar `trash_conveyor_horizontal_final.mp4` diputar sekitar satu detik lalu dijeda selama analisis. Pemindaian berikutnya melanjutkan posisi video sebelumnya. Jika video tidak dapat dimuat atau diputar, placeholder muncul dan simulasi tetap berjalan. Berat bagian terakhir mengikuti sisa berat. Contoh 1.200 kg dibagi 500 + 500 + 200 kg.
3. Periksa enam fraksi, estimasi kadar air, batas atas, dan nilai kalor. Pilih rute U/B/M. Perubahan rute membutuhkan alasan minimal 10 karakter, disimpan bersama rekomendasi awal.
4. Catat semua bagian lalu selesaikan muatan. Ringkasan menampilkan berat per tujuan dan rincian setiap bagian. Unduh CSV dengan pemisah titik koma untuk pengolahan lanjutan.

U dipilih jika batas atas kadar air ≤20%. M dipilih jika kadar air ≥55%, organik >50%, dan plastik ≤12%. Sisanya B, dengan contoh dosis serbuk kayu 15% dari massa bagian. Ini aturan demonstrasi, bukan solver MILP atau keputusan operasional terverifikasi. Angka kadar air memiliki margin contoh +5 poin persen, bukan P90 statistik yang terkalibrasi.

Kamera/QR, analisis AI, timbangan, kontrol palang/konveyor, serta panggilan bantuan tidak terhubung ke perangkat atau layanan nyata. Tombol bantuan menunjukkan kontak belum dikonfigurasi dan menyediakan simulasi tanpa mengirim pesan. Pengukuran asli memerlukan sampel, kalibrasi uji oven, massa aktual tiap bagian, pemeriksaan kontaminan, dan persetujuan pengawas sesuai SOP.

Riwayat awal berisi satu muatan contoh 1.000 kg. Data dan sesi demo disimpan di localStorage (`karta-prototype-v1`), hanya pada peramban tersebut. Tidak ada sinkronisasi atau pengiriman data. Google Fonts dimuat dari internet dengan cadangan font sistem. Hapus data situs di peramban untuk mengatur ulang demo.
