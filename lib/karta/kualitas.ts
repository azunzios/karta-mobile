// Pemeriksaan mutu citra (Subbab 3.7, Persamaan 3.18).
import { MUTU } from './konstanta.ts';

export type MutuCitra = { tajam: number; terang: number; masalah: string[] };

/** Ubah RGBA (ImageData.data) menjadi keabuan 0..255. */
export function keAbu(rgba: Uint8ClampedArray | Uint8Array, lebar: number, tinggi: number): Float32Array {
  const g = new Float32Array(lebar * tinggi);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return g;
}

/** Varians Laplacian 4-tetangga: S kecil = citra buram (lensa kotor/berembun/tidak fokus). */
export function variansLaplacian(abu: Float32Array, lebar: number, tinggi: number): number {
  let n = 0, jumlah = 0, kuadrat = 0;
  for (let y = 1; y < tinggi - 1; y++) {
    for (let x = 1; x < lebar - 1; x++) {
      const i = y * lebar + x;
      const L = abu[i - 1] + abu[i + 1] + abu[i - lebar] + abu[i + lebar] - 4 * abu[i];
      jumlah += L; kuadrat += L * L; n++;
    }
  }
  if (!n) return 0;
  const rata = jumlah / n;
  return kuadrat / n - rata * rata;
}

export function periksaMutu(rgba: Uint8ClampedArray | Uint8Array, lebar: number, tinggi: number, ambang = MUTU): MutuCitra {
  const abu = keAbu(rgba, lebar, tinggi);
  const tajam = variansLaplacian(abu, lebar, tinggi);
  let s = 0; for (let i = 0; i < abu.length; i++) s += abu[i];
  const terang = abu.length ? s / abu.length : 0;
  const masalah: string[] = [];
  if (tajam < ambang.tajamMin) masalah.push('Gambar buram: lensa kotor, berembun, atau kamera bergoyang. Bersihkan lensa lalu ulangi.');
  if (terang < ambang.terangMin) masalah.push('Terlalu gelap: nyalakan lampu LED atau pindah ke tempat lebih terang.');
  if (terang > ambang.terangMaks) masalah.push('Terlalu terang: hindari cahaya matahari langsung ke kamera.');
  return { tajam, terang, masalah };
}
