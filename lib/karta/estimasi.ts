// Rumus taksiran KARTA: luas -> massa -> kadar air -> rentang -> LHV -> rute -> dosis.
// Nomor persamaan merujuk ke lampiran laporan Bab 3.
import { AMBANG, C_MASSA, DOSIS, ENERGI, FRAKSI, FRAKSI_SERAP, H_KERING, KALOR_UAP_AIR, W_FRAKSI, type Fraksi } from './konstanta.ts';

export type Proporsi = Record<Fraksi, number>; // pecahan 0..1, jumlah = 1
export type RuteKarta = 'U' | 'B' | 'M' | 'R';

export const kosong = (): Proporsi => ({ organik_basah: 0, plastik: 0, kertas_kardus: 0, tekstil: 0, kayu_ranting: 0, inert: 0 });

export function normalisasi(p: Proporsi): Proporsi {
  const s = FRAKSI.reduce((a, k) => a + Math.max(0, p[k]), 0);
  const q = kosong();
  if (s <= 0) return q;
  for (const k of FRAKSI) q[k] = Math.max(0, p[k]) / s;
  return q;
}

/** Persamaan (3.5): rata-rata proporsi luas dari F frame. */
export function rataFrame(frame: Proporsi[]): Proporsi {
  const q = kosong();
  if (!frame.length) return q;
  for (const f of frame) for (const k of FRAKSI) q[k] += f[k] / frame.length;
  return normalisasi(q);
}

/** Persamaan (3.8): proporsi luas -> proporsi massa y_k. */
export function luasKeMassa(luas: Proporsi, c: Record<Fraksi, number> = C_MASSA): Proporsi {
  const q = kosong();
  for (const k of FRAKSI) q[k] = c[k] * luas[k];
  return normalisasi(q);
}

/** Persamaan (3.9): kadar air fisika = rata-rata tertimbang kadar air tiap fraksi. */
export function kadarAirFisika(massa: Proporsi, w: Record<Fraksi, number> = W_FRAKSI): number {
  return FRAKSI.reduce((a, k) => a + massa[k] * w[k], 0);
}

/** Persamaan (3.15) dan LHV kering campuran. */
export function lhvKering(massa: Proporsi, w: Record<Fraksi, number> = W_FRAKSI, h: Record<Fraksi, number> = H_KERING): number {
  const kering = FRAKSI.reduce((a, k) => a + massa[k] * (1 - w[k]), 0);
  if (kering <= 0) return 0;
  return FRAKSI.reduce((a, k) => a + (massa[k] * (1 - w[k]) / kering) * h[k], 0);
}

/** Persamaan (3.17): LHV basis basah, MJ/kg. */
export function lhvBasah(lhvKeringCampuran: number, w: number): number {
  return (1 - w) * lhvKeringCampuran - KALOR_UAP_AIR * w;
}

/** Persamaan (3.19): dosis serbuk kayu (kg per kg muatan), dibatasi 10-20%. */
export function dosisSerbuk(w: number, p = DOSIS): { dosis: number; terpotong: boolean } {
  const d = (w - p.wTarget) / (p.wTarget - p.wSerbuk);
  const dosis = Math.min(p.maks, Math.max(p.min, d));
  return { dosis, terpotong: d > p.maks };
}

/** Persamaan (3.21): energi listrik per ton muatan, kWh/ton. */
export function listrikPerTon(lhv: number, eta = ENERGI.efisiensiListrik): number {
  return Math.max(0, (1000 * lhv * eta) / 3.6);
}

// ------------------------------------------------------------------ koreksi + rentang
/** Model kadar air terkalibrasi (keluaran training/kalibrasi_kadar_air.py). */
export type ModelKadarAir = {
  versi: string;
  metode: 'bawaan' | 'jackknife+';
  n: number;
  alpha: number;
  fitur: string[];
  rerata: number[];
  sb: number[];
  b0: number;
  b: number[];
  loo?: { b0: number; b: number[]; r: number }[]; // model tinggalkan-satu dan galatnya R_i
  lebarBawaan?: { bawah: number; atas: number };
  catatan?: string;
};

export const MODEL_KADAR_AIR_BAWAAN: ModelKadarAir = {
  versi: 'bawaan-belum-kalibrasi', metode: 'bawaan', n: 0, alpha: 0.2,
  fitur: ['log1p_R24', 'log1p_R72', 'R24_x_serap', 'tps_pasar'], rerata: [0, 0, 0, 0], sb: [1, 1, 1, 1], b0: 0, b: [0, 0, 0, 0],
  lebarBawaan: { bawah: 0.1, atas: 0.1 },
  catatan: 'Belum dikalibrasi uji oven: koreksi hujan = 0 dan rentang memakai lebar bawaan ±10 poin persen.',
};

export type Konteks = { hujan24: number; hujan72: number; jenisTps: 'pasar' | 'permukiman' | 'ruang_publik' | 'lainnya' };

/** Vektor fitur x (Persamaan 3.11). */
export function fitur(massa: Proporsi, k: Konteks): number[] {
  const serap = FRAKSI_SERAP.reduce((a, f) => a + massa[f], 0);
  return [Math.log1p(Math.max(0, k.hujan24)), Math.log1p(Math.max(0, k.hujan72)), Math.max(0, k.hujan24) * serap, k.jenisTps === 'pasar' ? 1 : 0];
}

function linear(b0: number, b: number[], x: number[], m: ModelKadarAir): number {
  return b0 + b.reduce((a, bi, i) => a + bi * ((x[i] - m.rerata[i]) / (m.sb[i] || 1)), 0);
}

/** nilai terkecil ke-k (1-based) dari daftar. */
function terkecilKe(v: number[], k: number): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length, Math.max(1, k)) - 1];
}

/** Persamaan (3.11) dan (3.12): taksiran tengah dan rentang 80%. */
export function taksirKadarAir(wFisika: number, x: number[], m: ModelKadarAir = MODEL_KADAR_AIR_BAWAAN) {
  const tengah = wFisika + linear(m.b0, m.b, x, m);
  let bawah: number, atas: number;
  if (m.metode === 'jackknife+' && m.loo && m.loo.length >= 10) {
    const n = m.loo.length;
    const mu = m.loo.map(l => wFisika + linear(l.b0, l.b, x, m));
    bawah = terkecilKe(mu.map((v, i) => v - m.loo![i].r), Math.floor(m.alpha * (n + 1)));
    atas = terkecilKe(mu.map((v, i) => v + m.loo![i].r), Math.ceil((1 - m.alpha) * (n + 1)));
  } else {
    const l = m.lebarBawaan ?? { bawah: 0.1, atas: 0.1 };
    bawah = tengah - l.bawah;
    atas = tengah + l.atas;
  }
  const jepit = (v: number) => Math.min(0.95, Math.max(0, v));
  return { tengah: jepit(tengah), bawah: jepit(Math.min(bawah, tengah)), atas: jepit(Math.max(atas, tengah)) };
}

// ------------------------------------------------------------------ rute
export type AlasanRute = { rute: RuteKarta; alasan: string };

/** Aturan rute per muatan (Tabel 3.7). Persen dalam 0..100, kadar air dalam pecahan. */
export function tentukanRute(massaPersen: Record<Fraksi, number>, w: number, wAtas: number): AlasanRute {
  const a = AMBANG;
  if (massaPersen.inert >= a.inertMaksPersen) return { rute: 'R', alasan: `Inert ${massaPersen.inert.toFixed(0)}% ≥ ${a.inertMaksPersen}%: tahan di area residu.` };
  if (wAtas <= a.airUmpanMaks) return { rute: 'U', alasan: `Batas atas kadar air ${(wAtas * 100).toFixed(0)}% ≤ 20%: aman untuk reaktor.` };
  if (w >= a.airMaggotMin && massaPersen.organik_basah >= a.organikMaggotMin && massaPersen.plastik <= a.plastikMaggotMaks)
    return { rute: 'M', alasan: `Basah (${(w * 100).toFixed(0)}%), organik ${massaPersen.organik_basah.toFixed(0)}%, plastik ${massaPersen.plastik.toFixed(0)}%: cocok untuk maggot BSF.` };
  if (w < a.airBioDryingMaks) return { rute: 'B', alasan: w <= a.airUmpanMaks
    ? `Taksiran ${(w * 100).toFixed(0)}% tetapi batas atas ${(wAtas * 100).toFixed(0)}% melebihi syarat reaktor 20%: keringkan dulu agar aman.`
    : `Kadar air ${(w * 100).toFixed(0)}% di atas syarat reaktor 20%, masih bisa dikeringkan dengan bio-drying.` };
  return { rute: 'R', alasan: `Sangat basah (${(w * 100).toFixed(0)}%) dan tercampur: tunda atau residu.` };
}

// ------------------------------------------------------------------ satu langkah penuh
export type HasilEstimasi = {
  luas: Proporsi; massa: Proporsi;
  wFisika: number; w: number; wBawah: number; wAtas: number;
  lhvKering: number; lhv: number; lhvBawah: number; lhvAtas: number;
  rute: RuteKarta; alasan: string;
  dosis: number; dosisTerpotong: boolean;
  listrikKwhPerTon: number;
  fitur: number[];
};

export function estimasi(luas: Proporsi, k: Konteks, m: ModelKadarAir = MODEL_KADAR_AIR_BAWAAN): HasilEstimasi {
  const massa = luasKeMassa(normalisasi(luas));
  const wF = kadarAirFisika(massa);
  const x = fitur(massa, k);
  const t = taksirKadarAir(wF, x, m);
  const lk = lhvKering(massa);
  const persen = Object.fromEntries(FRAKSI.map(f => [f, massa[f] * 100])) as Record<Fraksi, number>;
  const r = tentukanRute(persen, t.tengah, t.atas);
  const d = dosisSerbuk(t.tengah);
  const lhv = lhvBasah(lk, t.tengah);
  return {
    luas: normalisasi(luas), massa, wFisika: wF, w: t.tengah, wBawah: t.bawah, wAtas: t.atas,
    lhvKering: lk, lhv, lhvBawah: lhvBasah(lk, t.atas), lhvAtas: lhvBasah(lk, t.bawah),
    rute: r.rute, alasan: r.alasan, dosis: d.dosis, dosisTerpotong: d.terpotong, listrikKwhPerTon: listrikPerTon(lhv), fitur: x,
  };
}
