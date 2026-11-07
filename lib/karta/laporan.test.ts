import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createReportCsv, createReportPdf, reportSummary } from './laporan.ts';
import { simulate, type Job } from '../triage.ts';

const job: Job = {
  id: 'UJI-001', tps: 'TPS "Pasar"; Gede', plate: 'AD 1234 HA', total: 1200, batchSize: 500,
  done: true, createdAt: '2026-11-05T02:00:00Z', tpsWorkerId: 'TPS-017', rain24: 0, rain72: 12,
  batches: [
    { ...simulate(0), id: 1, kg: 500, route: 'M', recommended: 'M', reason: '', time: '2026-11-05T02:10:00Z' },
    { ...simulate(1), id: 2, kg: 500, route: 'B', recommended: 'B', reason: '', dose: 0, time: '2026-11-05T02:12:00Z', rain24: 0 },
    { ...simulate(2), id: 3, kg: 200, route: 'R', recommended: 'U', reason: 'Perlu pemeriksaan manual', time: '2026-11-05T02:14:00Z', source: 'model', model: 'Model uji', lower: 10, lhvLow: 12, lhvHigh: 14, flags: ['Periksa sampel'], basis: 'Batas atas ≤ 20%' },
  ],
};

describe('Laporan riwayat', () => {
  it('merangkum massa bagian aktual, rute, dan sumber campuran', () => {
    const summary = reportSummary([job]);
    assert.equal(summary.totalKg, 1200);
    assert.equal(summary.parts, 3);
    assert.deepEqual(summary.routeWeights.map(item => item.kg), [0, 500, 500, 200]);
    assert.equal(summary.sourceLabel, 'Hasil model dan data simulasi');
    assert.equal(reportSummary([]).totalKg, 0);
  });
  it('CSV menjaga skema, escape teks, nilai nol, dan kolom opsional', () => {
    const csv = createReportCsv([job]);
    assert.ok(csv.startsWith('\uFEFF"ID muatan";'));
    assert.ok(csv.includes('"TPS ""Pasar""; Gede"'));
    assert.ok(csv.includes('"12–14"'));
    assert.ok(csv.includes('"0";"12";"0";"B";"B"'));
    assert.ok(!csv.includes('undefined'));
    assert.equal(csv.split('\r\n').length, 4);
  });
  it('CSV menyimpan baris baru dan melindungi teks yang menyerupai formula', () => {
    const csv = createReportCsv([{ ...job, tps: '=1+1', batches: [{ ...job.batches[0], reason: 'Catatan baris 1\nCatatan baris 2' }] }]);
    assert.ok(csv.includes('"\'=1+1"'));
    assert.ok(csv.includes('"Catatan baris 1\nCatatan baris 2"'));
  });
  it('PDF berisi identitas, analisis, komposisi, keputusan, dan halaman lanjutan', async () => {
    const longJob = { ...job, id: 'UJI-002', batches: Array.from({ length: 14 }, (_, i) => ({ ...job.batches[i % 3], id: i + 1, reason: 'Catatan panjang untuk pemeriksaan muatan. '.repeat(20) })) };
    const pdf = await createReportPdf([job, longJob], new Date('2026-11-07T02:00:00Z'));
    assert.ok(pdf.output().startsWith('%PDF-'));
    assert.ok(pdf.getNumberOfPages() > 3);
    const renderedPages = pdf.internal.pages as unknown as string[][];
    const rendered = renderedPages.flat().join('\n');
    for (const text of ['UJI-001', 'UJI-002', 'TPS-017', 'AD 1234 HA', 'Model uji', 'Periksa sampel', 'Organik %', 'Rekomendasi awal: Rute U; keputusan: Rute R', 'Batas atas <= 20%', 'Tidak tersedia']) {
      assert.ok(rendered.includes(text), `PDF kehilangan ${text}`);
    }
    assert.ok(!rendered.includes('undefined'));
    assert.ok(!rendered.includes('NaN'));
    for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
      assert.ok(renderedPages[page].some(line => line.includes(`${page} / ${pdf.getNumberOfPages()}`)));
    }
  });
});
