'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraSlash, FilmStrip, Image as ImageIcon, PlayCircle, Warning, Cpu } from '@phosphor-icons/react';
import { analisisFrame, siapkanMesin, sisiAnalisis, type MesinSiap } from '../lib/karta/segmentasi';
import { overlayRGBA, variasiAntarFrame } from '../lib/karta/segmentasi-inti';
import { rataFrame, type ModelKadarAir, type Proporsi } from '../lib/karta/estimasi';
import { FRAKSI, MUTU, NAMA_FRAKSI, WARNA_FRAKSI } from '../lib/karta/konstanta';

export type Sumber = 'video' | 'kamera' | 'unggah' | 'foto';
export type HasilPindai = {
 luas: Proporsi; frame: number; entropi: number; variasi: number; latarPersen: number;
 peringatan: string[]; msPerFrame: number; snapshot: string;
 model: { nama: string; versi: string; sumberData: string; miou?: number; mae?: number };
 kadarAir: ModelKadarAir;
};
type Status = { tahap: 'diam' | 'memuat' | 'memindai' | 'galat'; pesan?: string; persen?: number; frame?: number; total?: number };

const ASPEK = 16 / 9;
const JUMLAH_FRAME = 5, JEDA_FRAME = 450;
const tunggu = (ms: number) => new Promise(r => setTimeout(r, ms));
const LABEL: Record<Sumber, string> = { video: 'Video contoh', kamera: 'Kamera HP', unggah: 'Unggah video', foto: 'Foto' };

export default function LiveScanner({ part, weight, percent, onHasil, onSimulasi }: { part: number; weight: string; percent: string; onHasil: (h: HasilPindai) => void; onSimulasi: () => void }) {
 const [sumber, setSumber] = useState<Sumber>('video');
 const [status, setStatus] = useState<Status>({ tahap: 'diam' });
 const [mesin, setMesin] = useState<MesinSiap | null>(null);
 const [siapMedia, setSiapMedia] = useState(false), [galatMedia, setGalatMedia] = useState('');
 const [urlUnggah, setUrlUnggah] = useState(''), [urlFoto, setUrlFoto] = useState('');
 const [mutuLangsung, setMutuLangsung] = useState<string[]>([]);
 const [kotak, setKotak] = useState<{ x: number; y: number; s: number } | null>(null);
 const [legenda, setLegenda] = useState<Proporsi | null>(null);
 const panggung = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), foto = useRef<HTMLImageElement>(null), lapisan = useRef<HTMLCanvasElement>(null);
 const aliran = useRef<MediaStream | null>(null), batal = useRef(false), hidup = useRef(true);

 useEffect(() => { hidup.current = true; return () => { hidup.current = false; batal.current = true; aliran.current?.getTracks().forEach(t => t.stop()); }; }, []);

 // Muat model sekali saat layar pindai dibuka.
 useEffect(() => {
  let aktif = true;
  setStatus({ tahap: 'memuat', persen: 0 });
  siapkanMesin(p => aktif && setStatus({ tahap: 'memuat', persen: p }))
   .then(m => { if (aktif) { setMesin(m); setStatus({ tahap: 'diam' }); } })
   .catch(e => aktif && setStatus({ tahap: 'galat', pesan: (e as Error).message }));
  return () => { aktif = false; };
 }, []);

 // Ganti sumber gambar.
 useEffect(() => {
  setSiapMedia(false); setGalatMedia(''); setLegenda(null); petaAkhir.current = null;
  const ctx = lapisan.current?.getContext('2d'); ctx?.clearRect(0, 0, lapisan.current!.width, lapisan.current!.height);
  aliran.current?.getTracks().forEach(t => t.stop()); aliran.current = null;
  const v = video.current;
  if (sumber === 'kamera') {
   if (!navigator.mediaDevices?.getUserMedia) { setGalatMedia('Peramban tidak mendukung kamera. Buka lewat https atau gunakan Chrome.'); return; }
   navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    .then(s => { if (!hidup.current) { s.getTracks().forEach(t => t.stop()); return; } aliran.current = s; if (v) { v.srcObject = s; v.play().catch(() => {}); } })
    .catch(() => setGalatMedia('Izin kamera ditolak atau kamera dipakai aplikasi lain. Izinkan kamera di pengaturan peramban.'));
  } else if (v) {
   v.srcObject = null;
  }
 }, [sumber]);

 const ukurKotak = useCallback(() => {
  const el = panggung.current; if (!el) return;
  const W = el.clientWidth, H = el.clientHeight;
  const s = Math.min(W, H);
  setKotak({ x: (W - s) / 2, y: (H - s) / 2, s });
 }, []);
 useEffect(() => {
  ukurKotak();
  // Ukur ulang setiap kali ukuran panggung berubah (rotasi layar, kartu disembunyikan lalu tampil lagi).
  const el = panggung.current;
  if (!el || typeof ResizeObserver === 'undefined') { window.addEventListener('resize', ukurKotak); return () => window.removeEventListener('resize', ukurKotak); }
  const ro = new ResizeObserver(ukurKotak); ro.observe(el); return () => ro.disconnect();
 }, [ukurKotak]);

 const elemenSumber = (): { el: CanvasImageSource; w: number; h: number } | null => {
  if (sumber === 'foto') { const f = foto.current; return f && f.naturalWidth ? { el: f, w: f.naturalWidth, h: f.naturalHeight } : null; }
  const v = video.current; return v && v.readyState >= 2 && v.videoWidth ? { el: v, w: v.videoWidth, h: v.videoHeight } : null;
 };

 const petaAkhir = useRef<{ peta: Uint8Array; s: number } | null>(null);
 useEffect(() => { if (kotak && petaAkhir.current) gambarLapisan(petaAkhir.current.peta, petaAkhir.current.s); }, [kotak]); // eslint-disable-line react-hooks/exhaustive-deps
 function gambarLapisan(peta: Uint8Array, s: number) {
  petaAkhir.current = { peta, s };
  const c = lapisan.current; if (!c) return;
  c.width = s; c.height = s;
  c.getContext('2d')!.putImageData(new ImageData(overlayRGBA(peta, 125) as unknown as Uint8ClampedArray<ArrayBuffer>, s, s), 0, 0);
 }

 async function pindai() {
  if (!mesin || status.tahap === 'memindai') return;
  batal.current = false;
  const total = sumber === 'foto' ? 1 : JUMLAH_FRAME;
  const v = video.current;
  if (sumber !== 'foto' && v) { try { await v.play(); } catch { /* lanjut dengan frame yang ada */ } }
  const luas: Proporsi[] = []; const masalah = new Set<string>();
  let ent = 0, latar = 0, ms = 0, terakhir: HTMLCanvasElement | null = null, petaTerakhir: Uint8Array | null = null;
  try {
   for (let i = 0; i < total; i++) {
    if (batal.current) return;
    setStatus({ tahap: 'memindai', frame: i + 1, total });
    if (i > 0) await tunggu(JEDA_FRAME);
    const s = elemenSumber();
    if (!s) throw new Error(sumber === 'foto' ? 'Pilih foto terlebih dahulu.' : 'Gambar belum tersedia. Tunggu video atau kamera siap.');
    const sisi = sisiAnalisis(s.w, s.h, ASPEK);
    const h = await analisisFrame(mesin, s.el, s.w, s.h, sisi);
    if (!hidup.current) return;
    luas.push(h.luas); ent += h.entropi; latar += h.latarPersen; ms += h.ms;
    h.mutu.masalah.forEach(m => masalah.add(m));
    setMutuLangsung(h.mutu.masalah);
    gambarLapisan(h.kelasPeta, h.lebar); setLegenda(h.luas);
    terakhir = h.potongan; petaTerakhir = h.kelasPeta;
   }
  } catch (e) {
   setStatus({ tahap: 'diam' }); setGalatMedia((e as Error).message); v?.pause(); return;
  }
  v?.pause();
  const rata = rataFrame(luas);
  const variasi = variasiAntarFrame(luas);
  const peringatan = [...masalah];
  if (ent / total > MUTU.entropiMaks) peringatan.push('Model ragu mengenali sebagian besar piksel. Periksa manual sebelum memutuskan.');
  if (variasi > MUTU.variasiProporsiMaks) peringatan.push(`Komposisi antarframe berubah besar (±${variasi.toFixed(0)} poin). Periksa manual.`);
  if (latar / total > 85) peringatan.push('Sampah hampir tidak terlihat di kotak pindai. Arahkan kamera ke tumpukan sampah.');
  let snapshot = '';
  if (terakhir && petaTerakhir) {
   const k = document.createElement('canvas'); k.width = 160; k.height = 160;
   const c = k.getContext('2d')!; c.drawImage(terakhir, 0, 0, 160, 160);
   if (lapisan.current) c.drawImage(lapisan.current, 0, 0, 160, 160);
   snapshot = k.toDataURL('image/jpeg', 0.7);
  }
  setStatus({ tahap: 'diam' });
  const m = mesin.meta;
  onHasil({ luas: rata, frame: total, entropi: ent / total, variasi, latarPersen: latar / total, peringatan, msPerFrame: ms / total, snapshot,
   model: { nama: m.nama, versi: m.versi, sumberData: m.sumber_data, miou: m.metrik_uji?.miou, mae: m.metrik_uji?.mae_proporsi_pp }, kadarAir: mesin.kadarAir });
 }

 const sibuk = status.tahap === 'memindai';
 const ujiAlur = mesin && mesin.meta.sumber_data !== 'foto-tim';
 const pesanStatus = status.tahap === 'memuat' ? `Memuat model${status.persen ? ` ${status.persen}%` : '…'}` : sibuk ? `Memindai bagian ${part} · frame ${status.frame}/${status.total}` : sumber === 'kamera' ? 'Kamera siap' : sumber === 'foto' ? (urlFoto ? 'Foto siap' : 'Pilih foto') : 'Siap memindai';

 return <div className="live-scanner">
  <div className="source-tabs" role="group" aria-label="Sumber gambar">
   {(['video', 'kamera', 'unggah', 'foto'] as Sumber[]).map(s => <button key={s} type="button" aria-pressed={sumber === s} className={sumber === s ? 'active' : ''} disabled={sibuk} onClick={() => setSumber(s)}>
    {s === 'video' ? <PlayCircle size={18} /> : s === 'kamera' ? <Camera size={18} /> : s === 'unggah' ? <FilmStrip size={18} /> : <ImageIcon size={18} />}<span>{LABEL[s]}</span></button>)}
  </div>
  <div ref={panggung} className={`camera-placeholder conveyor-camera live-stage ${sibuk ? 'scanning' : ''}`} data-phase={sibuk ? 'scanning' : 'idle'} data-source={sumber}>
   {sumber !== 'foto' && <video ref={video} className="conveyor-video" key={sumber + urlUnggah} src={sumber === 'video' ? '/trash_conveyor_horizontal_final.mp4' : sumber === 'unggah' ? urlUnggah || undefined : undefined} muted playsInline loop={sumber !== 'kamera'} preload="auto" aria-label={LABEL[sumber]} onLoadedData={() => { setSiapMedia(true); setGalatMedia(''); ukurKotak(); }} onError={() => sumber !== 'kamera' && setGalatMedia('Video tidak dapat diputar.')} />}
   {sumber === 'foto' && urlFoto && <img ref={foto} className="conveyor-video" src={urlFoto} alt="Foto sampah yang dipindai" onLoad={() => { setSiapMedia(true); ukurKotak(); }} />}
   <div className="conveyor-scrim" />
   {kotak && <div className="scan-box" style={{ left: kotak.x, top: kotak.y, width: kotak.s, height: kotak.s }}><canvas ref={lapisan} className="seg-overlay" aria-hidden="true" /></div>}
   <div className="conveyor-status" role="status"><i className={sibuk ? 'is-moving' : ''} />{pesanStatus}</div>
   {sibuk && <div className="scanner-line" />}
   {status.tahap === 'memuat' && <div className="conveyor-message"><span className="spinner" /><span>Memuat model segmentasi ke HP…</span></div>}
   {(sumber === 'unggah' && !urlUnggah) || (sumber === 'foto' && !urlFoto) ? <label className="conveyor-message pick-file">{sumber === 'foto' ? <ImageIcon size={30} /> : <FilmStrip size={30} />}<strong>{sumber === 'foto' ? 'Ambil atau pilih foto sampah' : 'Pilih video sampah'}</strong><span>Arahkan ke tumpukan sampah, bukan ke truk.</span>
    <input type="file" accept={sumber === 'foto' ? 'image/*' : 'video/*'} className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (!f) return; const u = URL.createObjectURL(f); if (sumber === 'foto') setUrlFoto(u); else setUrlUnggah(u); }} /></label> : null}
   {galatMedia && <div className="conveyor-message" data-testid="video-fallback"><CameraSlash size={30} /><strong>{galatMedia}</strong><span>Pilih sumber lain di atas, atau pakai data simulasi.</span></div>}
   <span className="weight-chip conveyor-weight">{weight} kg | {percent}% muatan</span>
  </div>
  {legenda && <div className="seg-legend" aria-label="Komposisi luas frame terakhir">{FRAKSI.map(f => <span key={f}><i style={{ background: WARNA_FRAKSI[f] }} />{NAMA_FRAKSI[f]} {Math.round(legenda[f] * 100)}%</span>)}</div>}
  {galatMedia && <button type="button" className="secondary full fallback-sim" onClick={onSimulasi}>Pakai data simulasi</button>}
  {mutuLangsung.length > 0 && <p className="advice quality-warning"><Warning size={17} />{mutuLangsung[0]}</p>}
  {status.tahap === 'galat' ? <div className="model-error"><Warning size={20} /><div><strong>Model belum dapat dimuat</strong><small>{status.pesan}</small></div><button type="button" className="secondary full" onClick={onSimulasi}>Pakai data simulasi</button></div>
   : mesin && <p className="model-line"><Cpu size={16} /><span>{mesin.meta.nama} · {mesin.meta.ukuran_masukan[0]} px · {mesin.ukuranMb.toFixed(1)} MB</span>{ujiAlur ? <b className="model-tag warn">UJI ALUR</b> : <b className="model-tag">MODEL</b>}</p>}
  {ujiAlur && <p className="model-note">Model ini dilatih dengan data sintetis hanya untuk menguji alur. Hasilnya belum bermakna untuk sampah nyata sampai dilatih ulang dengan foto tim.</p>}
  <button className="primary full" disabled={!mesin || sibuk || status.tahap === 'memuat' || (sumber !== 'foto' && !siapMedia) || (sumber === 'foto' && !urlFoto)} onClick={pindai}>
   {sibuk ? <><span className="spinner small" />Menganalisis {status.frame}/{status.total}…</> : <>Pindai contoh</>}
  </button>
 </div>;
}
