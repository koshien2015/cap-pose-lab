/**
 * 診断ページ。環境判定と、いちばん軽いモデルでの推論1回を表示する（問い合わせ対応・実機確認用）。
 */

import { detectCapabilities } from './inference/capabilities';
import { loadManifest, modelUrl } from './inference/manifest';
import { fetchModel } from './inference/modelStore';
import { createSession, runPose } from './inference/ortSession';
import { recommend } from './inference/recommend';

const out = document.getElementById('out');
const log = (line: string) => {
  if (out) out.textContent = `${out.textContent === '確認中…' ? '' : out.textContent}${line}\n`;
};

async function main() {
  const report = await detectCapabilities();
  const rec = recommend(report);
  log(`判定: ${rec.verdict} / ${rec.executionProvider ?? '-'}`);
  log(JSON.stringify(report, null, 2));
  if (!rec.executionProvider) return;
  const manifest = await loadManifest();
  const bytes = await fetchModel(modelUrl(manifest.pose[0]), null, () => undefined);
  const { session, createMs } = await createSession(bytes, rec.executionProvider);
  const t0 = performance.now();
  const output = await runPose(session, new Float32Array(3 * 960 * 544), 960, 544);
  log(`セッション生成 ${Math.round(createMs)} ms / 推論1回 ${Math.round(performance.now() - t0)} ms / 出力 ${output.length} 要素`);
  await session.release();
  log('OK');
}

main().catch((e) => log(`失敗: ${String(e)}`));
