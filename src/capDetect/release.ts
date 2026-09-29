/**
 * リリース候補（SHARED の pitching_analysis.py の detect_release の移植）。
 * 直前に推論したコマの投手の状態が motion で、このコマが release なら、このコマをリリースとする。
 * 遡って推論した記録は処理の順番が前後するので、必ず frame 順に並べてから見る。
 * 1球分の動画なので、切り替わりが複数あれば最初のものを採る。
 */

import type { FrameRecord } from './records';

export function findReleaseCandidate(records: readonly FrameRecord[]): number | null {
  const sorted = [...records].sort((a, b) => a.frame - b.frame);
  const hit = sorted.find((r, i) => i > 0 && sorted[i - 1].pitcher === 'motion' && r.pitcher === 'release');
  return hit?.frame ?? null;
}
