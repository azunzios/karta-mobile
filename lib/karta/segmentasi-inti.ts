// Bagian segmentasi yang tidak bergantung peramban: praproses dan pascaproses.
import { FRAKSI, KELAS, WARNA_OVERLAY } from './konstanta.ts';
import { kosong, type Proporsi } from './estimasi.ts';

export type MetaModel = {
  nama: string; versi: string; arsitektur: string; encoder: string;
  kelas: string[]; ukuran_masukan: [number, number]; mean: number[]; std: number[];
  masukan: string; keluaran: string; sumber_data: string;
  metrik_uji?: { miou: number; mae_proporsi_pp: number; muatan_uji: number };
};

export type HasilFrame = {
  luas: Proporsi;          // proporsi luas 6 fraksi (tanpa latar), jumlah 1
  latarPersen: number;     // persen piksel latar
  entropi: number;         // rata-rata entropi probabilitas (nat)
  kelasPeta: Uint8Array;   // indeks kelas per piksel, ukuran H x W masukan
  lebar: number; tinggi: number;
};

/** RGBA (H x W) -> tensor float32 [1,3,H,W] ternormalisasi ImageNet. */
export function keTensor(rgba: Uint8ClampedArray | Uint8Array, lebar: number, tinggi: number, mean: number[], std: number[]): Float32Array {
  const n = lebar * tinggi;
  const t = new Float32Array(3 * n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    t[i] = (rgba[j] / 255 - mean[0]) / std[0];
    t[n + i] = (rgba[j + 1] / 255 - mean[1]) / std[1];
    t[2 * n + i] = (rgba[j + 2] / 255 - mean[2]) / std[2];
  }
  return t;
}

/** Probabilitas [C,H,W] -> peta kelas, proporsi luas, dan entropi. */
export function pascaproses(prob: Float32Array, lebar: number, tinggi: number, jumlahKelas: number = KELAS.length): HasilFrame {
  const n = lebar * tinggi;
  const peta = new Uint8Array(n);
  const hitung = new Array(jumlahKelas).fill(0);
  let ent = 0;
  for (let i = 0; i < n; i++) {
    let terbaik = 0, pmaks = -1, h = 0;
    for (let c = 0; c < jumlahKelas; c++) {
      const p = prob[c * n + i];
      if (p > pmaks) { pmaks = p; terbaik = c; }
      if (p > 1e-8) h -= p * Math.log(p);
    }
    peta[i] = terbaik; hitung[terbaik]++; ent += h;
  }
  const sampah = n - hitung[0];
  const luas = kosong();
  FRAKSI.forEach((f, idx) => { luas[f] = sampah > 0 ? hitung[idx + 1] / sampah : 0; });
  return { luas, latarPersen: (hitung[0] / n) * 100, entropi: ent / n, kelasPeta: peta, lebar, tinggi };
}

/** Peta kelas -> RGBA overlay semi-transparan (latar transparan). */
export function overlayRGBA(peta: Uint8Array, alpha = 120): Uint8ClampedArray {
  const out = new Uint8ClampedArray(peta.length * 4);
  for (let i = 0; i < peta.length; i++) {
    const c = peta[i];
    if (c === 0) continue;
    const w = WARNA_OVERLAY[c];
    out[4 * i] = w[0]; out[4 * i + 1] = w[1]; out[4 * i + 2] = w[2]; out[4 * i + 3] = alpha;
  }
  return out;
}

/** Simpangan antarframe (poin persen) untuk tanda "perlu cek manual". */
export function variasiAntarFrame(frame: Proporsi[]): number {
  if (frame.length < 2) return 0;
  let maks = 0;
  for (const f of FRAKSI) {
    const v = frame.map(x => x[f] * 100);
    const r = v.reduce((a, b) => a + b, 0) / v.length;
    const sb = Math.sqrt(v.reduce((a, b) => a + (b - r) ** 2, 0) / (v.length - 1));
    maks = Math.max(maks, sb);
  }
  return maks;
}
