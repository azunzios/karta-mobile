// Konstanta SORA. Semua angka di sini sama dengan lampiran laporan (Tabel 3.3, 3.5, 3.7)
// agar aplikasi, dashboard, dan dokumen memakai rumus dan nilai yang sama.

/** Urutan kelas keluaran model segmentasi (indeks 0..6). WAJIB sama dengan training/karta_kelas.py. */
export const KELAS = ['latar', 'organik_basah', 'plastik', 'kertas_kardus', 'tekstil', 'kayu_ranting', 'inert'] as const;
export type Kelas = (typeof KELAS)[number];
export type Fraksi = Exclude<Kelas, 'latar'>;
export const FRAKSI: Fraksi[] = ['organik_basah', 'plastik', 'kertas_kardus', 'tekstil', 'kayu_ranting', 'inert'];

/** Nama tampilan. Kunci "name" pada Reading.composition memakai nama ini. */
export const NAMA_FRAKSI: Record<Fraksi, string> = {
  organik_basah: 'Organik', plastik: 'Plastik', kertas_kardus: 'Kertas', tekstil: 'Tekstil', kayu_ranting: 'Kayu', inert: 'Inert',
};
export const WARNA_FRAKSI: Record<Fraksi, string> = {
  organik_basah: '#11a792', plastik: '#527df0', kertas_kardus: '#e7b34b', tekstil: '#b09be8', kayu_ranting: '#b88963', inert: '#9ba8ba',
};
/** Warna overlay per indeks kelas (RGB), latar tidak diwarnai. */
export const WARNA_OVERLAY: [number, number, number][] = [
  [0, 0, 0], [17, 167, 146], [82, 125, 240], [231, 179, 75], [176, 155, 232], [184, 137, 99], [155, 168, 186],
];

/** Koefisien massa per satuan luas, relatif terhadap organik basah (c_k, Persamaan 3.8). */
export const C_MASSA: Record<Fraksi, number> = { organik_basah: 1.0, plastik: 0.15, kertas_kardus: 0.4, tekstil: 0.5, kayu_ranting: 0.6, inert: 1.2 };
/** Kadar air tipikal tiap fraksi, pecahan basis basah (w_k, Tabel 3.5; Tchobanoglous dkk. 1993). */
export const W_FRAKSI: Record<Fraksi, number> = { organik_basah: 0.7, plastik: 0.05, kertas_kardus: 0.1, tekstil: 0.15, kayu_ranting: 0.4, inert: 0.05 };
/** LHV basis kering tiap fraksi, MJ/kg (H_k, Persamaan 3.16, Tabel 3.5). */
export const H_KERING: Record<Fraksi, number> = { organik_basah: 14.1, plastik: 31.7, kertas_kardus: 16.2, tekstil: 18.0, kayu_ranting: 18.5, inert: 0.5 };
/** Fraksi penyerap air untuk fitur R24 x y_serap (Persamaan 3.11). */
export const FRAKSI_SERAP: Fraksi[] = ['organik_basah', 'kertas_kardus', 'tekstil'];

/** Kalor penguapan air pada 25 °C, MJ per kg air (ISO 18125; ISO 21654). */
export const KALOR_UAP_AIR = 2.443;

/** Ambang aturan rute (Tabel 3.7). Nilai awal, disesuaikan bersama pengelola PLTSa. */
export const AMBANG = {
  inertMaksPersen: 20,      // inert >= 20% -> R
  airUmpanMaks: 0.2,         // w+ <= 20% -> U
  airMaggotMin: 0.6,         // w >= 60% ...
  organikMaggotMin: 60,      // ... organik >= 60% ...
  plastikMaggotMaks: 5,      // ... plastik <= 5% -> M
  airBioDryingMaks: 0.65,    // w < 65% -> B, selain itu R
  lebarRentangCekManual: 0.25,
};

/** Dosis serbuk kayu (Persamaan 3.19). */
export const DOSIS = { wTarget: 0.5, wSerbuk: 0.12, min: 0.1, maks: 0.2 };

/** Parameter energi (Persamaan 3.21). Efisiensi adalah asumsi prototipe. */
export const ENERGI = { efisiensiListrik: 0.2 };

/** Ambang mutu citra (Subbab 3.7). Dikalibrasi ulang dari foto saat pemasangan. */
export const MUTU = { tajamMin: 40, terangMin: 45, terangMaks: 215, entropiMaks: 1.1, variasiProporsiMaks: 18 };

/** Lokasi bawaan untuk data hujan bila izin lokasi ditolak: Kota Surakarta. */
export const LOKASI_BAWAAN = { lat: -7.5666, lon: 110.8167, nama: 'Surakarta' };
