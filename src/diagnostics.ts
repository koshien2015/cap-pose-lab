/**
 * 診断ページ。環境判定を表示し、ボタンを押したときだけ、いちばん軽いモデルで推論を1回試す
 * （問い合わせ対応・実機確認用。モデルは自動でダウンロードしない）。
 */

import { detectCapabilities } from './inference/capabilities';
import { loadManifest, modelUrl } from './inference/manifest';
import { fetchModel, openModelCache } from './inference/modelStore';
import { createSession, runPose } from './inference/ortSession';
import { recommend } from './inference/recommend';

const out = document.getElementById('out');
const log = (line: string) => {
  if (out) out.textContent = `${out.textContent === '確認中…' ? '' : out.textContent}${line}\n`;
};

async function tryInference(ep: 'webgpu' | 'wasm') {
  const manifest = await loadManifest();
  const bytes = await fetchModel(modelUrl(manifest.pose[0]), await openModelCache(), () => undefined);
  const { session, createMs } = await createSession(bytes, ep);
  const t0 = performance.now();
  const output = await runPose(session, new Float32Array(3 * 960 * 544), 960, 544);
  log(`セッション生成 ${Math.round(createMs)} ms / 推論1回 ${Math.round(performance.now() - t0)} ms / 出力 ${output.length} 要素`);
  await session.release();
  log('OK');
}

const params = new URLSearchParams(location.search);

/** 1回目はシェーダの準備を含むので、2〜6回目の平均を出す */
async function tryDetector(ep: 'webgpu' | 'wasm') {
  const manifest = await loadManifest();
  const override = params.get('detector');
  const file = override && /^[\w.-]+\.onnx$/.test(override) ? override : manifest.capDetector.file;
  const bytes = await fetchModel(modelUrl({ file }), await openModelCache(), () => undefined);
  const { session, createMs } = await createSession(bytes, ep);
  const [w, h] = [640, 384];
  const input = new Float32Array(3 * w * h).fill(0.45);
  const first = await runPose(session, input, w, h);
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) await runPose(session, input, w, h);
  log(
    `キャップ検出 ${file} (${ep}): セッション生成 ${Math.round(createMs)} ms / 推論1回（平均） ${Math.round((performance.now() - t0) / 5)} ms / 出力 ${first.length} 要素`,
  );
  await session.release();
  log('OK');
}

async function main() {
  const report = await detectCapabilities();
  const rec = recommend(report);
  log(`判定: ${rec.verdict} / ${rec.executionProvider ?? '-'}`);
  log(JSON.stringify(report, null, 2));
  const ep = rec.executionProvider;
  const button = document.getElementById('try');
  if (!ep || !button) return;
  button.hidden = false;
  button.addEventListener('click', () => {
    button.hidden = true;
    tryInference(ep).catch((e) => log(`失敗: ${String(e)}`));
  });
  const detectorButton = document.getElementById('try-detector');
  const detectorEp = params.get('ep') === 'wasm' ? 'wasm' : ep;
  if (detectorButton) {
    detectorButton.hidden = false;
    detectorButton.addEventListener('click', () => {
      detectorButton.hidden = true;
      tryDetector(detectorEp).catch((e) => log(`失敗: ${String(e)}`));
    });
  }
}

main().catch((e) => log(`失敗: ${String(e)}`));
