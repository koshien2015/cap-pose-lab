/**
 * 角度系列と身体サイズ（pitching/metrics の移植。ビューアに要るものだけ）。
 * どれも「フレームごとの値」の配列で、決まらないフレームは NaN。
 */

import { directionAngle, distance, gradient, jointAngle, midpoint } from './geometry';
import { pointAt } from './tracks';
import type { Tracks } from './types';

type Side = 'left' | 'right';

const orNaN = (v: number | null) => (v === null ? Number.NaN : v);

function perFrame(tracks: Tracks, fn: (position: number) => number | null): number[] {
  return tracks.frameIndices.map((_, position) => orNaN(fn(position)));
}

/** 投球腕の肘角度（肩-肘-手首のなす角）。伸びきると 180 に近い */
export function elbowAngleSeries(t: Tracks, side: Side): number[] {
  return perFrame(t, (i) => jointAngle(pointAt(t, `${side}_shoulder`, i), pointAt(t, `${side}_elbow`, i), pointAt(t, `${side}_wrist`, i)));
}

/** 肘伸展角速度（度/秒）。正なら伸びる方向 */
export function extensionVelocity(angles: readonly number[], fps: number): number[] {
  return gradient(angles, fps);
}

/** 肘→手首の方向角（+90 が真上、0 が打者方向の水平） */
export function forearmAngleSeries(t: Tracks, side: Side, sign: number): number[] {
  return perFrame(t, (i) => directionAngle(pointAt(t, `${side}_elbow`, i), pointAt(t, `${side}_wrist`, i), sign));
}

/** 前脚の膝角度（股関節-膝-足首のなす角） */
export function leadKneeAngleSeries(t: Tracks, lead: Side): number[] {
  return perFrame(t, (i) => jointAngle(pointAt(t, `${lead}_hip`, i), pointAt(t, `${lead}_knee`, i), pointAt(t, `${lead}_ankle`, i)));
}

/** 体幹の傾き（直立で 0、正なら打者方向へ倒れている）。2D の見かけの角度 */
export function trunkLeanSeries(t: Tracks, sign: number): number[] {
  return perFrame(t, (i) => {
    const shoulder = midpoint(pointAt(t, 'left_shoulder', i), pointAt(t, 'right_shoulder', i));
    const hip = midpoint(pointAt(t, 'left_hip', i), pointAt(t, 'right_hip', i));
    const axis = directionAngle(hip, shoulder, sign);
    return axis === null ? null : 90 - axis;
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 正規化の基準長（両肩間の距離の中央値、ピクセル）。決まらなければ null */
export function bodyScale(t: Tracks, mode: 'shoulder_width' = 'shoulder_width'): number | null {
  if (mode !== 'shoulder_width') throw new Error(`未対応の正規化方式: ${String(mode)}`);
  const values = perFrame(t, (i) => distance(pointAt(t, 'left_shoulder', i), pointAt(t, 'right_shoulder', i))).filter(Number.isFinite);
  if (values.length === 0) return null;
  const scale = median(values);
  return scale > 0 ? scale : null;
}
