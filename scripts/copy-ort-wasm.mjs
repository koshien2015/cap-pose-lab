// onnxruntime-web の wasm 本体を public/ort/ に複製する（npm パッケージと同一バージョンを同一オリジンから配信するため）。
// WebGPU 実行は jsep ビルドを使う。
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// require 条件の解決先は dist/ort.min.js なので、その親が dist
const dist = dirname(require.resolve('onnxruntime-web'));
const out = join(process.cwd(), 'public', 'ort');
mkdirSync(out, { recursive: true });
for (const name of ['ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs']) {
  copyFileSync(join(dist, name), join(out, name));
}
console.log(`copied onnxruntime-web wasm to ${out}`);
