/**
 * 打者の骨格を比較画面の座標にする（設計書 §14.4）。
 * 大きさ: 胴の長さ = 1。原点: 構え（腰が写った最初のコマ）の腰の中点。
 * Y は上が正、X はホームベース側が正（背面からだと左打者はホームベースが画面の左なので、左右を反転する）。
 * 両手首の中点を hands という点として足す（片方の手首が欠けたコマには足さない）。
 */

import { midpoint, type Point } from '../analysis/geometry';
import { round, ViewerDataError, type ViewerFrame, type XY } from '../analysis/payload';
import { pointAt } from '../analysis/tracks';
import type { Bats, SwingAnalysis } from './analyzeSwing';

export const HANDS = 'hands';

export type Side = 'left' | 'right';

/** 右打者はホームベースが画面の右（+1）、左打者は左（-1） */
export const plateSign = (bats: Bats): 1 | -1 => (bats === 'right' ? 1 : -1);
/** 前の側（投手に近い側）。右打者は左 */
export const leadSideOf = (bats: Bats): Side => (bats === 'right' ? 'left' : 'right');
/** 後ろの側（捕手に近い側）。右打者は右 */
export const rearSideOf = (bats: Bats): Side => bats;

export function swingOrigin(a: SwingAnalysis): Point {
  const t = a.smoothed;
  for (let i = 0; i < t.frameIndices.length; i += 1) {
    const origin = midpoint(pointAt(t, 'left_hip', i), pointAt(t, 'right_hip', i));
    if (origin) return origin;
  }
  throw new ViewerDataError('腰が写っているコマが無いため、比較の基準点を決められません。打者の全身が写った動画で試してください');
}

export function swingFrames(a: SwingAnalysis, origin: Point, scale: number): ViewerFrame[] {
  const t = a.smoothed;
  const sign = plateSign(a.config.bats);
  const toXY = (p: Point): XY => [round(((p[0] - origin[0]) * sign) / scale, 4), round(-(p[1] - origin[1]) / scale, 4)];
  return t.frameIndices.map((f, position) => {
    const k: Record<string, XY> = {};
    t.names.forEach((name) => {
      const p = pointAt(t, name, position);
      if (p) k[name] = toXY(p);
    });
    const hands = midpoint(pointAt(t, 'left_wrist', position), pointAt(t, 'right_wrist', position));
    if (hands) k[HANDS] = toXY(hands);
    const progress = a.progress[position];
    return { f, t: round(t.timestamps[position], 4), p: Number.isFinite(progress) ? round(progress, 3) : null, k };
  });
}
