// Curah hujan 24 dan 72 jam terakhir dari Open-Meteo (gratis, tanpa kunci API).
export type Hujan = { r24: number; r72: number; sumber: string; waktu: string };

export function urlOpenMeteo(lat: number, lon: number): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=precipitation&past_days=3&forecast_days=1&timezone=Asia%2FJakarta`;
}

/** Jumlahkan hujan per jam sampai jam sekarang (data Open-Meteo "hourly"). */
export function jumlahHujan(data: { hourly?: { time?: string[]; precipitation?: (number | null)[] } }, sekarang: Date): { r24: number; r72: number } {
  const t = data.hourly?.time ?? [], p = data.hourly?.precipitation ?? [];
  // Waktu Open-Meteo dalam zona lokal tanpa offset; bandingkan sebagai waktu Asia/Jakarta (UTC+7).
  const ms = (s: string) => Date.parse(`${s}:00+07:00`);
  const kini = sekarang.getTime();
  let r24 = 0, r72 = 0;
  for (let i = 0; i < t.length; i++) {
    const w = ms(t[i]);
    if (!(w <= kini)) continue;
    const v = Number(p[i] ?? 0) || 0;
    if (kini - w < 24 * 3600e3) r24 += v;
    if (kini - w < 72 * 3600e3) r72 += v;
  }
  return { r24: Math.round(r24 * 10) / 10, r72: Math.round(r72 * 10) / 10 };
}

export async function ambilHujan(lat: number, lon: number, namaLokasi: string, sinyal?: AbortSignal): Promise<Hujan> {
  const res = await fetch(urlOpenMeteo(lat, lon), { signal: sinyal });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { r24, r72 } = jumlahHujan(await res.json(), new Date());
  return { r24, r72, sumber: `Open-Meteo · ${namaLokasi}`, waktu: new Date().toISOString() };
}
