import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { periksaMutu } from './kualitas.ts';
import { pascaproses, variasiAntarFrame } from './segmentasi-inti.ts';
import { jumlahHujan } from './cuaca.ts';

const papan = (w: number, h: number, f: (x: number, y: number) => number) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); const i = 4 * (y * w + x); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } return d; };

describe('Mutu citra (Pers. 3.18)', () => {
 it('papan catur tajam lolos, bidang rata ditandai buram', () => {
  assert.equal(periksaMutu(papan(64, 64, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 200 : 60), 64, 64).masalah.length, 0);
  assert.match(periksaMutu(papan(64, 64, () => 128), 64, 64).masalah.join(' '), /buram/);
 });
 it('terlalu gelap dan terlalu terang', () => {
  assert.match(periksaMutu(papan(64, 64, (x, y) => ((x + y) % 2) * 30), 64, 64).masalah.join(' '), /gelap/);
  assert.match(periksaMutu(papan(64, 64, (x, y) => 225 + ((x + y) % 2) * 30), 64, 64).masalah.join(' '), /terang/);
 });
});

describe('Pascaproses segmentasi', () => {
 it('menghitung proporsi luas tanpa latar dan entropi', () => {
  const w = 2, h = 2, n = 4, C = 7, p = new Float32Array(C * n);
  const set = (i: number, c: number) => { p[c * n + i] = 1; };
  set(0, 0); set(1, 1); set(2, 1); set(3, 2);
  const r = pascaproses(p, w, h);
  assert.equal(r.latarPersen, 25); assert.ok(Math.abs(r.luas.organik_basah - 2 / 3) < 1e-9); assert.ok(Math.abs(r.luas.plastik - 1 / 3) < 1e-9); assert.equal(r.entropi, 0);
 });
 it('variasi antarframe dalam poin persen', () => {
  const a = { organik_basah: 0.5, plastik: 0.5, kertas_kardus: 0, tekstil: 0, kayu_ranting: 0, inert: 0 };
  assert.equal(variasiAntarFrame([a]), 0);
  assert.ok(variasiAntarFrame([a, { ...a, organik_basah: 0.9, plastik: 0.1 }]) > 25);
 });
});

describe('Hujan Open-Meteo', () => {
 it('menjumlahkan 24 dan 72 jam sebelum sekarang', () => {
  const time: string[] = [], precipitation: number[] = [];
  const awal = Date.parse('2026-11-03T00:00:00+07:00');
  for (let j = 0; j < 96; j++) { const d = new Date(awal + j * 3600e3 + 7 * 3600e3); time.push(d.toISOString().slice(0, 16)); precipitation.push(1); }
  const r = jumlahHujan({ hourly: { time, precipitation } }, new Date('2026-11-06T00:30:00+07:00'));
  assert.equal(r.r24, 24); assert.equal(r.r72, 72);
 });
});
