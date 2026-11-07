import { ROUTES, routes, type Batch, type Job } from '../triage.ts';

export type ReportFormat = 'csv' | 'pdf';
const number = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value);
const value = (n: number | undefined, unit = '') => n === undefined || !Number.isFinite(n) ? 'Tidak tersedia' : `${number(n)}${unit}`;
const date = (input: string) => Number.isNaN(Date.parse(input)) ? 'Tidak tersedia' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(input)) + ' WIB';
const fractions = ['Organik', 'Plastik', 'Kertas', 'Tekstil', 'Kayu', 'Inert'];
const fraction = (batch: Batch, name: string) => batch.composition.filter(c => c.name === name || (name === 'Inert' && c.name === 'Residu')).reduce((sum, c) => sum + c.value, 0);
const source = (batch: Batch) => batch.source === 'model' ? 'Hasil model' : 'Data simulasi';
const tpsTypes = { pasar: 'Pasar', permukiman: 'Permukiman', ruang_publik: 'Ruang publik', lainnya: 'Lainnya' };
// Keep mathematical notation readable with the PDF's built-in Latin font.
const pdfText = (text: string) => text.replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/−/g, '-');

export function reportSummary(jobs: Job[]) {
  const batches = jobs.flatMap(job => job.batches);
  const totalKg = batches.reduce((sum, batch) => sum + batch.kg, 0);
  return {
    loads: jobs.length, parts: batches.length, totalKg,
    routeWeights: ROUTES.map(route => ({ route, kg: batches.filter(batch => batch.route === route).reduce((sum, batch) => sum + batch.kg, 0) })),
    sourceLabel: batches.some(batch => batch.source === 'model')
      ? batches.some(batch => batch.source !== 'model') ? 'Hasil model dan data simulasi' : 'Hasil model'
      : 'Data simulasi',
  };
}

export function createReportCsv(jobs: Job[]) {
  const rows = [
    ['ID muatan','Waktu','TPS','Jenis TPS','Pelat','Bagian','Berat kg','Kadar air %','Batas bawah %','Batas atas %','LHV MJ/kg','LHV rentang MJ/kg','Organik %','Plastik %','Kertas %','Tekstil %','Kayu %','Inert %','Hujan 24 jam mm','Hujan 72 jam mm','Dosis serbuk kayu %','Rekomendasi','Keputusan','Tujuan','Dasar rekomendasi','Peringatan','Sumber analisis','Model','Alasan petugas','ID petugas TPS'],
    ...jobs.flatMap(job => job.batches.map(batch => [
      job.id, batch.time, job.tps, job.tpsType ?? '', job.plate, batch.id, batch.kg, batch.water, batch.lower ?? '', batch.upper,
      batch.lhv, batch.lhvLow !== undefined && batch.lhvHigh !== undefined ? `${batch.lhvLow}–${batch.lhvHigh}` : '',
      ...fractions.map(name => fraction(batch, name)), batch.rain24 ?? job.rain24 ?? '', batch.rain72 ?? job.rain72 ?? '',
      batch.route === 'B' ? batch.dose ?? '' : '', batch.recommended, batch.route, routes[batch.route].destination,
      batch.basis ?? '', (batch.flags ?? []).join(' | '), batch.source ?? 'simulasi', batch.model ?? '', batch.reason, job.tpsWorkerId ?? '',
    ])),
  ];
  return '\uFEFF' + rows.map(row => row.map(cell => {
    const text = typeof cell === 'string' && /^[\s]*[=+@-]/.test(cell) ? "'" + cell : String(cell);
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(';')).join('\r\n');
}

/** Build a real, searchable A4 PDF. Tables wrap text and continue across pages. */
export async function createReportPdf(jobs: Job[], generatedAt = new Date()) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ format: 'a4', unit: 'mm', compress: true });
  const summary = reportSummary(jobs);
  const margin = 16, width = 178;
  let y = 25;
  doc.setProperties({ title: 'SORA - Laporan riwayat muatan', subject: 'Hasil analisis dan keputusan pengolahan sampah', author: 'SORA · PLTSa Putri Cempo' });

  function heading(text: string) {
    if (y > 253) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor('#172640');
    const lines = doc.splitTextToSize(pdfText(text), width);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  }
  function table(head: string[], body: (string | number)[][], columnStyles: Parameters<typeof autoTable>[1]['columnStyles'] = {}) {
    autoTable(doc, {
      startY: y, head: [head.map(pdfText)], body: body.map(row => row.map(cell => typeof cell === 'string' ? pdfText(cell) : cell)), margin: { top: 25, right: margin, bottom: 20, left: margin },
      theme: 'striped', pageBreak: 'avoid', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', textColor: '#172640', valign: 'top' },
      headStyles: { fillColor: '#1b429b', textColor: '#ffffff', fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: '#f0f4fb' }, columnStyles,
      didDrawPage: data => { y = (data.cursor?.y ?? 25) + 9; },
    });
  }

  doc.setFont('helvetica', 'bold').setFontSize(23).setTextColor('#172640');
  doc.text('Laporan riwayat muatan', margin, y); y += 8;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor('#526278');
  doc.text(`PLTSa Putri Cempo, Surakarta | Dibuat ${date(generatedAt.toISOString())}`, margin, y); y += 8;
  table(['Muatan', 'Bagian dianalisis', 'Berat tercatat', 'Sumber data'], [[summary.loads, summary.parts, `${number(summary.totalKg)} kg`, summary.sourceLabel]]);
  heading('Distribusi tujuan akhir');
  table(['Rute', 'Tujuan', 'Berat (kg)', 'Proporsi'], summary.routeWeights.map(({ route, kg }) => [
    `${route} · ${routes[route].name}`, routes[route].destination, number(kg), `${number(summary.totalKg ? kg / summary.totalKg * 100 : 0)}%`,
  ]), { 0: { cellWidth: 43 }, 1: { cellWidth: 85 }, 2: { halign: 'right' }, 3: { halign: 'right' } });

  if (!jobs.length) { heading('Belum ada data muatan untuk dilaporkan.'); }
  for (const job of jobs) {
    heading(`Muatan ${job.id}`);
    const recorded = job.batches.reduce((sum, batch) => sum + batch.kg, 0);
    table(['Identitas muatan', 'Keterangan'], [
      ['TPS asal / jenis', `${job.tps} / ${job.tpsType ? tpsTypes[job.tpsType] : 'Tidak tersedia'}`],
      ['Pelat / petugas TPS', `${job.plate} / ${job.tpsWorkerId || 'Tidak tersedia'}`],
      ['Dicatat / status', `${date(job.createdAt)} / ${job.done ? 'Selesai' : 'Dalam proses'}`],
      ['Berat muatan / tercatat', `${value(job.total, ' kg')} / ${number(recorded)} kg (${job.batches.length} bagian)`],
      ['Hujan 24 jam / 72 jam', `${value(job.rain24, ' mm')} / ${value(job.rain72, ' mm')}`],
      ...(job.rainSource ? [['Sumber hujan', job.rainSource]] : []),
    ], { 0: { cellWidth: 52 } });
    table([`Bagian (${job.id})`, 'Waktu (WIB)', 'Berat kg', 'Air %', 'LHV MJ/kg', 'Rekom.', 'Keputusan'], job.batches.map(batch => [
      batch.id, date(batch.time), value(batch.kg), value(batch.water), value(batch.lhv), batch.recommended, batch.route,
    ]), { 0: { cellWidth: 27 }, 1: { cellWidth: 40 } });
    table([`Komposisi (${job.id})`, ...fractions.map(name => `${name} %`)], job.batches.map(batch => [
      `Bagian ${batch.id}`, ...fractions.map(name => number(fraction(batch, name))),
    ]), { 0: { cellWidth: 40 } });

    table([`Bagian (${job.id})`, 'Analisis dan keputusan'], job.batches.map(batch => {
      const details = [
        `Tujuan: ${routes[batch.route].destination}`,
        `Kadar air: ${value(batch.water, '%')}; batas bawah: ${value(batch.lower, '%')}; batas atas: ${value(batch.upper, '%')}`,
        `LHV: ${value(batch.lhv, ' MJ/kg')}; rentang: ${value(batch.lhvLow)} - ${value(batch.lhvHigh)} MJ/kg`,
        `Hujan 24 jam / 72 jam: ${value(batch.rain24 ?? job.rain24, ' mm')} / ${value(batch.rain72 ?? job.rain72, ' mm')}`,
        `Sumber analisis: ${source(batch)}${batch.model ? `; model: ${batch.model}` : ''}`,
        ...(batch.dataLabel ? [`Data model: ${batch.dataLabel}`] : []),
        ...(batch.route === 'B' ? [`Dosis serbuk kayu: ${value(batch.dose, '%')}${batch.doseCapped ? ' (dibatasi)' : ''}`] : []),
        ...(batch.kwhPerTon !== undefined ? [`Estimasi listrik: ${value(batch.kwhPerTon, ' kWh/ton')}`] : []),
        `Dasar rekomendasi: ${batch.basis || 'Tidak tersedia'}`,
        `Rekomendasi awal: Rute ${batch.recommended}; keputusan: Rute ${batch.route}`,
        `Alasan petugas: ${batch.reason || 'Tidak ada catatan'}`,
        ...(batch.flags?.length ? [`Peringatan:\n${batch.flags.map(flag => `- ${flag}`).join('\n')}`] : []),
      ];
      return [`Bagian ${batch.id}`, details.join('\n')];
    }), { 0: { cellWidth: 30 } });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor('#dce4f0').setLineWidth(0.3).line(margin, 18, 194, 18);
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor('#1b429b').text('SORA', margin, 13);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor('#526278').text('LAPORAN RIWAYAT MUATAN', 194, 13, { align: 'right' });
    doc.line(margin, 280, 194, 280);
    doc.text('Berat berdasarkan bagian tercatat · Waktu dalam WIB', margin, 286);
    doc.text(`${page} / ${pages}`, 194, 286, { align: 'right' });
  }
  return doc;
}

export async function downloadReport(jobs: Job[], format: ReportFormat, jobId?: string) {
  if (!jobs.some(job => job.batches.length)) throw new Error('Belum ada data untuk diunduh.');
  const filename = `SORA-${(jobId || 'laporan').replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`;
  if (format === 'pdf') {
    const doc = await createReportPdf(jobs);
    await doc.save(filename, { returnPromise: true });
    return;
  }
  const url = URL.createObjectURL(new Blob([createReportCsv(jobs)], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
