/**
 * スイング1本分のまとめの値（設計書 §14.5）。出せないときは値を null にし、理由を添える（作った値で埋めない）。
 * 座標は swingFrames で揃えたもの（胴の長さ = 1、ホームベース側が +X）。
 */

import { gradient } from '../analysis/geometry';
import type { SummaryItem, ViewerFrame } from '../analysis/payload';
import type { Bats } from './analyzeSwing';
import { leadSideOf } from './swingFrames';
import type { SwingPanelKey } from './swingSeries';

/** 踏み込みの向きを「ほぼまっすぐ」とみなす幅（胴の長さ単位） */
export const STRAIGHT_STRIDE = 0.1;
/** 開きの時間差を出すのに要る、探す範囲の中で値のあるコマの数 */
export const MIN_OPEN_SAMPLES = 3;
export const NEED_IMPACT = 'インパクトを指定すると出ます';

/** まとめを出す範囲（コマの位置） */
export interface SwingWindow {
  readonly top: number | null;
  readonly impact: number | null;
}

type Head = Omit<SummaryItem, 'value' | 'text' | 'reason'>;

const LAG: Head = { key: 'open_lag_ms', label: '開きの時間差', unit: ' ms', digits: 0, signed: true };
const HEAD: Head = { key: 'head_max_move', label: '頭の最大移動（胴の長さ）', unit: '', digits: 2, signed: false };
const STRIDE: Head = { key: 'stride_dir', label: '踏み込みの向き（胴の長さ）', unit: '', digits: 2, signed: true };

const itemOf = (head: Head, value: number | null, text: string | null, reason: string | null): SummaryItem => ({
  ...head,
  value,
  text,
  reason,
});

/** 開く速さ（中央差分）が最大のコマの位置。範囲に値が足りなければ null。同じ速さなら先のコマ */
function peakVelocity(values: readonly number[], fps: number, from: number, to: number): number | null {
  if (values.slice(from, to + 1).filter(Number.isFinite).length < MIN_OPEN_SAMPLES) return null;
  const velocity = gradient(values, fps);
  let best: number | null = null;
  for (let i = from; i <= to; i += 1) {
    if (Number.isFinite(velocity[i]) && (best === null || velocity[i] > velocity[best])) best = i;
  }
  return best;
}

/** 腰の開く速さが最大のコマ → 肩の開く速さが最大のコマまでの時間（ms、+ は腰が先） */
export function openLagMs(
  shoulder: readonly number[],
  hip: readonly number[],
  times: readonly number[],
  fps: number,
  from: number,
  to: number,
): number | null {
  const s = peakVelocity(shoulder, fps, from, to);
  const h = peakVelocity(hip, fps, from, to);
  return s === null || h === null ? null : Math.round((times[s] - times[h]) * 1000);
}

export function strideLabel(move: number): string {
  if (move > STRAIGHT_STRIDE) return '閉じ（踏み込み）';
  if (move < -STRAIGHT_STRIDE) return '開き（アウトステップ）';
  return 'ほぼまっすぐ';
}

function lagItem(frames: readonly ViewerFrame[], series: Record<SwingPanelKey, number[]>, fps: number, w: SwingWindow): SummaryItem {
  const from = w.top ?? 0;
  const to = w.impact ?? frames.length - 1;
  const lag = openLagMs(series.shoulder_open, series.hip_open, frames.map((f) => f.t), fps, from, to);
  if (lag === null) return itemOf(LAG, null, null, '肩と腰が写っているコマが足りません');
  return itemOf(LAG, lag, lag > 0 ? '腰が先' : lag < 0 ? '肩が先' : '同時', null);
}

function headItem(series: Record<SwingPanelKey, number[]>, w: SwingWindow): SummaryItem {
  if (w.impact === null) return itemOf(HEAD, null, null, NEED_IMPACT);
  const moves = series.head_x
    .slice(0, w.impact + 1)
    .map((x, i) => Math.hypot(x, series.head_y[i]))
    .filter(Number.isFinite);
  if (moves.length === 0) return itemOf(HEAD, null, null, '頭（両耳）が写っていません');
  return itemOf(HEAD, Math.max(...moves), null, null);
}

function strideItem(frames: readonly ViewerFrame[], bats: Bats, w: SwingWindow): SummaryItem {
  if (w.impact === null) return itemOf(STRIDE, null, null, NEED_IMPACT);
  const name = `${leadSideOf(bats)}_ankle`;
  const start = frames.slice(0, w.impact + 1).find((f) => f.k[name])?.k[name];
  const end = frames[w.impact]?.k[name];
  if (!start || !end) return itemOf(STRIDE, null, null, '前足首が写っていません');
  const move = end[0] - start[0];
  return itemOf(STRIDE, move, strideLabel(move), null);
}

export function swingSummary(
  frames: readonly ViewerFrame[],
  series: Record<SwingPanelKey, number[]>,
  fps: number,
  bats: Bats,
  window: SwingWindow,
): SummaryItem[] {
  return [lagItem(frames, series, fps, window), headItem(series, window), strideItem(frames, bats, window)];
}
