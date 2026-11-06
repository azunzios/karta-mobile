// Mesin segmentasi di peramban: ONNX Runtime Web (WebAssembly) menjalankan model
// DeepLabv3+ hasil training/latih.py langsung di HP. Tidak perlu server.
import type { MetaModel, HasilFrame } from './segmentasi-inti.ts';
import { keTensor, pascaproses } from './segmentasi-inti.ts';
import { periksaMutu, type MutuCitra } from './kualitas.ts';
import { MODEL_KADAR_AIR_BAWAAN, type ModelKadarAir } from './estimasi.ts';

type OrtTensor = { data: Float32Array; dims: number[] };
type OrtSesi = { run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>; inputNames: string[]; outputNames: string[] };
type Ort = {
  env: { wasm: { wasmPaths?: string; numThreads?: number; simd?: boolean } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: { create(model: ArrayBuffer | Uint8Array, opt?: object): Promise<OrtSesi> };
};

export type MesinSiap = { meta: MetaModel & { berkas?: string }; sesi: OrtSesi; ukuranMb: number; kadarAir: ModelKadarAir };
export type HasilAnalisisFrame = HasilFrame & { mutu: MutuCitra; ms: number };

const AKAR = '/models/';
let janjiOrt: Promise<Ort> | null = null;
let janjiMesin: Promise<MesinSiap> | null = null;

function muatOrt(): Promise<Ort> {
  if (janjiOrt) return janjiOrt;
  janjiOrt = new Promise<Ort>((ok, gagal) => {
    const w = window as unknown as { ort?: Ort };
    if (w.ort) return ok(w.ort);
    const s = document.createElement('script');
    s.src = '/ort/ort.wasm.min.js';
    s.async = true;
    s.onload = () => (w.ort ? ok(w.ort) : gagal(new Error('ONNX Runtime tidak termuat')));
    s.onerror = () => gagal(new Error('Berkas /ort/ort.wasm.min.js tidak ditemukan. Jalankan npm install.'));
    document.head.appendChild(s);
  }).then(ort => {
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    return ort;
  });
  janjiOrt.catch(() => { janjiOrt = null; });
  return janjiOrt;
}

async function unduh(url: string, kemajuan?: (persen: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model tidak ditemukan (${url}, ${res.status}). Salin hasil pelatihan ke public/models/.`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const r = res.body.getReader();
  const out = new Uint8Array(total);
  let n = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    out.set(value, n); n += value.length;
    kemajuan?.(Math.round((n / total) * 100));
  }
  return out.subarray(0, n);
}

/** Muat model segmentasi dan model kadar air (sekali, lalu disimpan di memori). */
export function siapkanMesin(kemajuan?: (persen: number) => void): Promise<MesinSiap> {
  if (janjiMesin) return janjiMesin;
  janjiMesin = (async () => {
    const [ort, metaRes] = await Promise.all([muatOrt(), fetch(`${AKAR}karta-seg.json`)]);
    if (!metaRes.ok) throw new Error('Berkas public/models/karta-seg.json belum ada.');
    const meta = (await metaRes.json()) as MesinSiap['meta'];
    const data = await unduh(`${AKAR}${meta.berkas ?? 'karta-seg.onnx'}`, kemajuan);
    const sesi = await ort.InferenceSession.create(data, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    let kadarAir = MODEL_KADAR_AIR_BAWAAN;
    try {
      const r = await fetch(`${AKAR}kadar-air.json`);
      if (r.ok) kadarAir = (await r.json()) as ModelKadarAir;
    } catch { /* pakai bawaan */ }
    return { meta, sesi, ukuranMb: data.length / 1e6, kadarAir };
  })();
  janjiMesin.catch(() => { janjiMesin = null; });
  return janjiMesin;
}

/** Sisi persegi analisis (koordinat sumber): persegi terbesar di tengah bagian yang terlihat
 *  pada bingkai dengan rasio aspek `aspekBingkai` (object-fit: cover). */
export function sisiAnalisis(lebarSumber: number, tinggiSumber: number, aspekBingkai: number): number {
  const aspek = lebarSumber / tinggiSumber;
  const tampakL = aspek > aspekBingkai ? tinggiSumber * aspekBingkai : lebarSumber;
  const tampakT = aspek > aspekBingkai ? tinggiSumber : lebarSumber / aspekBingkai;
  return Math.min(tampakL, tampakT);
}

/** Ambil potongan persegi di tengah sumber (video/kamera/foto) ke kanvas s x s. */
export function potongTengah(sumber: CanvasImageSource, lebarSumber: number, tinggiSumber: number, s: number, kanvas?: HTMLCanvasElement, sisiSumber?: number) {
  const k = kanvas ?? document.createElement('canvas');
  k.width = s; k.height = s;
  const ctx = k.getContext('2d', { willReadFrequently: true })!;
  const sisi = sisiSumber ?? Math.min(lebarSumber, tinggiSumber);
  ctx.drawImage(sumber, (lebarSumber - sisi) / 2, (tinggiSumber - sisi) / 2, sisi, sisi, 0, 0, s, s);
  return { kanvas: k, data: ctx.getImageData(0, 0, s, s) };
}

/** Jalankan segmentasi satu frame. */
export async function analisisFrame(mesin: MesinSiap, sumber: CanvasImageSource, lebar: number, tinggi: number, sisiSumber?: number): Promise<HasilAnalisisFrame & { potongan: HTMLCanvasElement }> {
  const [h, w] = mesin.meta.ukuran_masukan;
  const t0 = performance.now();
  const { data, kanvas } = potongTengah(sumber, lebar, tinggi, w, undefined, sisiSumber);
  const mutu = periksaMutu(data.data, w, h);
  const ort = (window as unknown as { ort: Ort }).ort;
  const x = new ort.Tensor('float32', keTensor(data.data, w, h, mesin.meta.mean, mesin.meta.std), [1, 3, h, w]);
  const keluar = await mesin.sesi.run({ [mesin.meta.masukan]: x });
  const prob = keluar[mesin.meta.keluaran].data;
  const hasil = pascaproses(prob, w, h, mesin.meta.kelas.length);
  return { ...hasil, mutu, ms: performance.now() - t0, potongan: kanvas };
}
