import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('Riwayat mengunduh seluruh laporan dan tiap muatan dalam CSV atau PDF', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Coba demo' }).click();
  await page.getByRole('button', { name: 'Riwayat', exact: true }).click();
  await page.getByRole('button', { name: 'Unduh semua laporan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /CSV/ })).toBeChecked();
  await expect(dialog).toContainText('1 muatan · 2 bagian · 1.000 kg');
  const csvEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Unduh laporan CSV', exact: true }).click();
  const csv = await csvEvent;
  expect(csv.suggestedFilename()).toBe('SORA-laporan.csv');
  expect(await readFile((await csv.path())!, 'utf8')).toContain('"KRT-0041"');

  await dialog.getByRole('radio', { name: /PDF/ }).check();
  await page.screenshot({ path: 'artifacts/riwayat-format-laporan.png', fullPage: true });
  const pdfEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Unduh laporan PDF', exact: true }).click();
  const pdf = await pdfEvent;
  expect(pdf.suggestedFilename()).toBe('SORA-laporan.pdf');
  const bytes = await readFile((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(2000);
  await pdf.saveAs('artifacts/contoh-laporan-riwayat.pdf');

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: /TPS Pasar Legi/ }).click();
  await dialog.getByRole('radio', { name: /PDF/ }).check();
  const singleEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Unduh laporan PDF', exact: true }).click();
  expect((await singleEvent).suggestedFilename()).toBe('SORA-KRT-0041.pdf');
  expect(errors).toEqual([]);
});

test('Riwayat kosong menonaktifkan unduhan', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('karta-prototype-v1', JSON.stringify({ logged: true, jobs: [], activeId: null })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Riwayat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unduh semua laporan', exact: true })).toBeDisabled();
});
