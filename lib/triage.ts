export type Route = 'U' | 'B' | 'M';
export type Composition = { name: string; value: number; color: string };
export type Reading = { water: number; upper: number; lhv: number; composition: Composition[] };
export type Batch = Reading & { id: number; kg: number; recommended: Route; route: Route; reason: string; time: string };
export type Job = { id: string; tps: string; plate: string; tpsWorkerId?: string; total: number; batchSize: number; batches: Batch[]; done: boolean; createdAt: string };
export const routes = {
 U: { name: 'Gasifikasi', full: 'Umpan gasifikasi langsung', destination: 'Reaktor gasifikasi (Zona U)', color: '#2865e8', className: 'blue', detail: 'Batas atas kadar air ≤20%. Siap menjadi umpan gasifikasi.' },
 B: { name: 'Bio-drying', full: 'Pengeringan dengan serbuk kayu', destination: 'Bak bio-drying (Zona B)', color: '#b56308', className: 'amber', detail: 'Keringkan terlebih dahulu. Tambahkan serbuk kayu 15% dari berat bagian.' },
 M: { name: 'Maggot & kompos', full: 'Biokonversi organik basah', destination: 'Unit maggot BSF & kompos (Zona M)', color: '#078879', className: 'teal', detail: 'Kadar air ≥55%, organik dominan, dan plastik ≤12%. Pisahkan kontaminan sebelum biokonversi.' },
};
export function recommend(reading: Reading): Route {
 const organic = reading.composition.find(c=>c.name==='Organik')?.value ?? 0;
 const plastic = reading.composition.find(c=>c.name==='Plastik')?.value ?? 100;
 if (reading.upper<=20) return 'U';
 if (reading.water>=55 && organic>50 && plastic<=12) return 'M';
 return 'B';
}
export function remaining(job: Job) { return Math.max(0, job.total-job.batches.reduce((s,b)=>s+b.kg,0)); }
export function simulate(index: number): Reading {
 const samples = [ [68,73,4.8,74,8,6,3,4,5], [37,42,8.6,39,25,17,8,5,6], [14,19,13.2,18,32,28,12,5,5], [61,66,5.4,67,10,8,5,4,6] ];
 const [water,upper,lhv,...values] = samples[index%samples.length];
 return { water,upper,lhv,composition:['Organik','Plastik','Kertas','Kayu','Tekstil','Residu'].map((name,i)=>({name,value:values[i],color:['#11a792','#527df0','#e7b34b','#b88963','#b09be8','#9ba8ba'][i]})) };
}
export function makeBatch(job: Job, reading: Reading, route: Route, reason: string): Batch {
 if (remaining(job)<=0 || job.done) throw new Error('Muatan sudah selesai.');
 const recommended=recommend(reading);
 if(route!==recommended && reason.trim().length<10) throw new Error('Tulis alasan perubahan minimal 10 karakter.');
 return {...reading,id:job.batches.length+1,kg:Math.min(job.batchSize,remaining(job)),recommended,route,reason:reason.trim(),time:new Date().toISOString()};
}
