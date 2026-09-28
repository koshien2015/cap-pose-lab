/**
 * 推定残り時間。これまでの平均ペースで残りを割り出すだけの単純な見積もり。
 */

/** done 件に elapsedMs かかったとき、total 件までの残り ms。見積もれなければ null。 */
export function estimateRemainingMs(elapsedMs: number, done: number, total: number): number | null {
  if (done <= 0 || total <= done || elapsedMs <= 0) return done >= total && done > 0 ? 0 : null;
  return (elapsedMs / done) * (total - done);
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '計算中';
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `約 ${sec} 秒`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest === 0 ? `約 ${min} 分` : `約 ${min} 分 ${rest} 秒`;
}
