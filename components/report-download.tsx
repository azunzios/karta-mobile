'use client';

import { useId, useRef, useState } from 'react';
import { DownloadSimple, FileCsv, FilePdf } from '@phosphor-icons/react';
import { downloadReport, reportSummary, type ReportFormat } from '../lib/karta/laporan';
import type { Job } from '../lib/triage';

export default function ReportDownload({ jobs, jobId, onDownloaded }: { jobs: Job[]; jobId?: string; onDownloaded: (message: string) => void }) {
  const id = useId();
  const [format, setFormat] = useState<ReportFormat>('csv');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const downloading = useRef(false);
  const summary = reportSummary(jobs);
  async function download() {
    if (downloading.current) return;
    downloading.current = true; setBusy(true); setError('');
    try {
      await downloadReport(jobs, format, jobId);
      onDownloaded(`Laporan ${format.toUpperCase()} diunduh.`);
    } catch {
      setError('Laporan gagal dibuat. Silakan coba lagi.');
    } finally { downloading.current = false; setBusy(false); }
  }
  return <section className="report-download" aria-label="Unduh laporan">
    <fieldset disabled={busy}>
      <legend>Format laporan</legend>
      <div className="report-formats">
        {([{ value: 'csv', label: 'CSV', description: 'Olah data di spreadsheet', Icon: FileCsv }, { value: 'pdf', label: 'PDF', description: 'Laporan rapi, siap cetak', Icon: FilePdf }] as const).map(({ value, label, description, Icon }) => <label key={value} className={`report-format ${format === value ? 'selected' : ''}`}>
          <input type="radio" name={id} value={value} checked={format === value} onChange={() => { setFormat(value); setError(''); }} />
          <Icon size={28} aria-hidden="true" />
          <strong>{label}</strong><small>{description}</small>
        </label>)}
      </div>
    </fieldset>
    <p className="report-scope">{summary.loads} muatan · {summary.parts} bagian · {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(summary.totalKg)} kg</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!summary.parts && <p className="muted">Belum ada data untuk diunduh.</p>}
    <button className="primary full" disabled={busy || !summary.parts} aria-busy={busy} onClick={download}>
      {busy ? <><span className="spinner small" />Menyiapkan laporan…</> : <><DownloadSimple size={21} aria-hidden="true" />Unduh laporan {format.toUpperCase()}</>}
    </button>
  </section>;
}
