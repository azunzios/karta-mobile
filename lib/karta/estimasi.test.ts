import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dosisSerbuk, estimasi, kadarAirFisika, lhvBasah, lhvKering, listrikPerTon, luasKeMassa, rataFrame, taksirKadarAir, tentukanRute, MODEL_KADAR_AIR_BAWAAN, type ModelKadarAir, type Proporsi } from './estimasi.ts';

// Contoh Tabel 3.6 lampiran: muatan 5.000 kg.
const luas: Proporsi = { organik_basah: 0.45, plastik: 0.25, kertas_kardus: 0.1, tekstil: 0.05, kayu_ranting: 0.1, inert: 0.05 };
const dekat = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

describe('Rumus lampiran Bab 3', () => {
 it('Pers. 3.8: plastik 25% luas hanya 5,6% massa; organik 66,9%', () => {
  const m = luasKeMassa(luas);
  dekat(m.plastik, 0.0558, 5e-4); dekat(m.organik_basah, 0.6691, 5e-4); dekat(m.inert, 0.0892, 5e-4);
 });
 it('Pers. 3.9: kadar air fisika 0,523', () => dekat(kadarAirFisika(luasKeMassa(luas)), 0.5229, 5e-4));
 it('Pers. 3.15-3.16: LHV kering campuran 14,63 MJ/kg', () => dekat(lhvKering(luasKeMassa(luas)), 14.63, 0.01));
 it('Pers. 3.17: LHV basah 5,24 MJ/kg pada w = 0,55, dan 11,2 MJ/kg pada w = 0,20', () => { dekat(lhvBasah(14.63, 0.55), 5.24, 0.01); dekat(lhvBasah(14.63, 0.2), 11.22, 0.01); });
 it('Pers. 3.19: dosis 13% pada w = 0,55; dibatasi 10% dan 20%', () => { dekat(dosisSerbuk(0.55).dosis, 0.1316, 1e-3); assert.equal(dosisSerbuk(0.45).dosis, 0.1); const d = dosisSerbuk(0.62); assert.equal(d.dosis, 0.2); assert.ok(d.terpotong); });
 it('Pers. 3.21: LHV 10 MJ/kg, efisiensi 20% -> 556 kWh/ton', () => dekat(listrikPerTon(10, 0.2), 555.6, 0.1));
 it('Pers. 3.5: rata-rata frame dinormalisasi', () => { const r = rataFrame([luas, { ...luas, organik_basah: 0.55, plastik: 0.15 }]); dekat(r.organik_basah, 0.5, 1e-9); dekat(Object.values(r).reduce((a, b) => a + b, 0), 1, 1e-9); });
 it('Model bawaan: rentang ±10 poin, tanpa koreksi hujan', () => { const t = taksirKadarAir(0.52, [2, 3, 5, 1]); dekat(t.tengah, 0.52, 1e-9); dekat(t.bawah, 0.42, 1e-9); dekat(t.atas, 0.62, 1e-9); });
 it('Jackknife+: kuantil ke-floor(a(n+1)) dan ke-ceil((1-a)(n+1))', () => {
  const n = 19;
  const m: ModelKadarAir = { ...MODEL_KADAR_AIR_BAWAAN, metode: 'jackknife+', n, b0: 0, b: [0, 0, 0, 0], loo: Array.from({ length: n }, (_, i) => ({ b0: 0, b: [0, 0, 0, 0], r: (i + 1) / 100 })) };
  const t = taksirKadarAir(0.5, [0, 0, 0, 0], m);
  // floor(0,2*20)=4 -> 0,5-0,16 ; ceil(0,8*20)=16 -> 0,5+0,16
  dekat(t.bawah, 0.34, 1e-9); dekat(t.atas, 0.66, 1e-9);
 });
 it('Aturan rute Tabel 3.7', () => {
  const p = (o: number, pl: number, i: number) => ({ organik_basah: o, plastik: pl, kertas_kardus: 0, tekstil: 0, kayu_ranting: 0, inert: i });
  assert.equal(tentukanRute(p(30, 20, 25), 0.1, 0.15).rute, 'R');
  assert.equal(tentukanRute(p(30, 20, 5), 0.12, 0.2).rute, 'U');
  assert.equal(tentukanRute(p(70, 4, 5), 0.66, 0.74).rute, 'M');
  assert.equal(tentukanRute(p(50, 20, 5), 0.55, 0.63).rute, 'B');
  assert.equal(tentukanRute(p(50, 20, 5), 0.7, 0.78).rute, 'R');
 });
 it('Satu langkah penuh contoh Tabel 3.6 dengan koreksi +0,027 -> Rute B', () => {
  const m: ModelKadarAir = { ...MODEL_KADAR_AIR_BAWAAN, b0: 0.0271 };
  const e = estimasi(luas, { hujan24: 12, hujan72: 20, jenisTps: 'permukiman' }, m);
  dekat(e.w, 0.55, 1e-3); dekat(e.lhv, 5.24, 0.02); assert.equal(e.rute, 'B'); dekat(e.dosis, 0.13, 0.005);
  assert.ok(e.lhvBawah < e.lhv && e.lhv < e.lhvAtas);
 });
});
