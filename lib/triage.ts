import { AMBANG } from './karta/konstanta.ts';

export type Route = 'U' | 'B' | 'M' | 'R';
export const ROUTES: Route[] = ['U', 'B', 'M', 'R'];
export type Composition = { name: string; value: number; color: string };
/** Hasil analisis satu bagian. Persen dalam 0..100. Kolom opsional ditambahkan oleh mesin prediksi. */
export type Reading = {
 water: number; upper: number; lhv: number; composition: Composition[];
 lower?: number; lhvLow?: number; lhvHigh?: number; lhvDry?: number; waterPhysics?: number;
 area?: Composition[]; dose?: number; doseCapped?: boolean; kwhPerTon?: number;
 basis?: string; flags?: string[]; source?: 'model' | 'simulasi'; model?: string; dataLabel?: string;
 frames?: number; msPerFrame?: number; rain24?: number; rain72?: number; snapshot?: string;
};
export type Batch = Reading & { id: number; kg: number; recommended: Route; route: Route; reason: string; time: string };
export type TpsType = 'pasar' | 'permukiman' | 'ruang_publik' | 'lainnya';
export type Job = { id: string; tps: string; plate: string; tpsWorkerId?: string; total: number; batchSize: number; batches: Batch[]; done: boolean; createdAt: string; tpsType?: TpsType; rain24?: number; rain72?: number; rainSource?: string };
export const routes = {
 U: { name: 'Gasifikasi', full: 'Umpan gasifikasi langsung', destination: 'Reaktor gasifikasi (Zona U)', color: '#2865e8', className: 'blue', detail: 'Batas atas kadar air ≤20%. Siap menjadi umpan gasifikasi.' },
 B: { name: 'Bio-drying', full: 'Pengeringan dengan serbuk kayu', destination: 'Bak bio-drying (Zona B)', color: '#b56308', className: 'amber', detail: 'Kadar air di atas 20% dan di bawah 65%. Keringkan dulu dengan serbuk kayu 10–20% sesuai dosis hitungan.' },
 M: { name: 'Maggot & kompos', full: 'Biokonversi organik basah', destination: 'Unit maggot BSF & kompos (Zona M)', color: '#078879', className: 'teal', detail: 'Kadar air ≥60%, organik ≥60%, dan plastik ≤5%. Pisahkan kontaminan sebelum biokonversi.' },
 R: { name: 'Residu', full: 'Ditahan atau residu', destination: 'Area residu (Zona R)', color: '#5b6577', className: 'slate', detail: 'Inert ≥20%, atau sangat basah (≥65%) dan tercampur. Jangan masuk reaktor; laporkan ke TPS asal.' },
};
const nilai = (r: Reading, ...nama: string[]) => r.composition.filter(c => nama.includes(c.name)).reduce((s, c) => s + c.value, 0);
/** Aturan rute per bagian (lampiran Tabel 3.7). Komposisi dalam persen massa. */
export function recommend(reading: Reading): Route {
 const a = AMBANG;
 if (nilai(reading, 'Inert', 'Residu') >= a.inertMaksPersen) return 'R';
 if (reading.upper <= a.airUmpanMaks * 100) return 'U';
 if (reading.water >= a.airMaggotMin * 100 && nilai(reading, 'Organik') >= a.organikMaggotMin && nilai(reading, 'Plastik') <= a.plastikMaggotMaks) return 'M';
 if (reading.water < a.airBioDryingMaks * 100) return 'B';
 return 'R';
}
export function remaining(job: Job) { return Math.max(0, job.total-job.batches.reduce((s,b)=>s+b.kg,0)); }
/** Data contoh untuk mode simulasi (tanpa model). */
export function simulate(index: number): Reading {
 const samples = [ [68,74,4.1,78,4,6,5,3,4], [41,47,7.9,39,25,17,8,5,6], [14,19,13.2,18,32,28,12,5,5], [52,58,4.6,40,8,6,10,4,32] ];
 const [water,upper,lhv,...values] = samples[index%samples.length];
 return { water,upper,lhv,source:'simulasi',composition:['Organik','Plastik','Kertas','Kayu','Tekstil','Inert'].map((name,i)=>({name,value:values[i],color:['#11a792','#527df0','#e7b34b','#b88963','#b09be8','#9ba8ba'][i]})) };
}
export function makeBatch(job: Job, reading: Reading, route: Route, reason: string): Batch {
 if (remaining(job)<=0 || job.done) throw new Error('Muatan sudah selesai.');
 const recommended=recommend(reading);
 if(route!==recommended && reason.trim().length<10) throw new Error('Tulis alasan perubahan minimal 10 karakter.');
 return {...reading,id:job.batches.length+1,kg:Math.min(job.batchSize,remaining(job)),recommended,route,reason:reason.trim(),time:new Date().toISOString()};
}
