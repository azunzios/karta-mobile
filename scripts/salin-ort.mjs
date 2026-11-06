// Salin berkas ONNX Runtime Web ke public/ort agar dimuat langsung oleh peramban
// (tanpa CDN). Dijalankan otomatis oleh "npm install" (postinstall) dan "npm run build".
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const asal = join(akar, 'node_modules', 'onnxruntime-web', 'dist');
const tujuan = join(akar, 'public', 'ort');
const berkas = ['ort.wasm.min.js', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
if (!existsSync(asal)) {
  console.warn('[salin-ort] onnxruntime-web belum terpasang, dilewati.');
  process.exit(0);
}
mkdirSync(tujuan, { recursive: true });
for (const b of berkas) copyFileSync(join(asal, b), join(tujuan, b));
console.log(`[salin-ort] ${berkas.length} berkas -> public/ort`);
