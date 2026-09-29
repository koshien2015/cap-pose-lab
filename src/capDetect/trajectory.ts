/**
 * 投球1球分の検出点に、時間の2次式を RANSAC で当てる（SHARED の trajectory_fitter.py の移植）。
 * 座標は表示ピクセル、t は秒。Python 版との違い（設計書 §9.7）:
 * - 外れ値の閾値をピクセルで渡す（呼ぶ側が画面の高さ × INLIER_THRESHOLD_RATIO にする）
 * - 乱数はシード付きの自前実装（mulberry32）。紛らわしい点の並びでは、採る点の組み合わせが Python 版と変わりうる
 */

export const MIN_POINTS_FOR_FIT = 5;
export const RANSAC_ITERATIONS = 200;
/** 外れ値の閾値 = 画面の高さ × この値（px） */
export const INLIER_THRESHOLD_RATIO = 0.015;
export const PITCH_DISTANCE_M = 9.22;

export interface TrajectoryPoint {
  readonly frame: number;
  readonly t: number;
  readonly x: number;
  readonly y: number;
}

export interface CompletedPoint extends TrajectoryPoint {
  readonly interpolated: boolean;
}

/** v = c0 + c1*t + c2*t^2 */
export type Coeffs = readonly [number, number, number];

export interface FitResult {
  readonly coeffsX: Coeffs;
  readonly coeffsY: Coeffs;
  readonly inliers: readonly TrajectoryPoint[];
  readonly outliers: readonly TrajectoryPoint[];
  readonly rmse: number;
}

export class FitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitError';
  }
}

const sum = (values: readonly number[]) => values.reduce((s, v) => s + v, 0);

function det3(m: readonly (readonly number[])[]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** 最小二乗で2次式を当てる（正規方程式を Cramer の公式で解く）。時刻の違う点が3点以上必要 */
export function fitQuadratic(ts: readonly number[], vs: readonly number[]): Coeffs {
  if (ts.length !== vs.length || new Set(ts).size < 3) {
    throw new FitError('2次式を当てるには、時刻の違う点が3点以上必要です');
  }
  const p = (k: number) => sum(ts.map((t) => t ** k));
  const q = (k: number) => sum(ts.map((t, i) => t ** k * vs[i]));
  const a = [
    [p(0), p(1), p(2)],
    [p(1), p(2), p(3)],
    [p(2), p(3), p(4)],
  ];
  const b = [q(0), q(1), q(2)];
  const d = det3(a);
  const solve = (col: number) => det3(a.map((row, r) => row.map((v, c) => (c === col ? b[r] : v)))) / d;
  return [solve(0), solve(1), solve(2)];
}

export function evaluate(c: Coeffs, t: number): number {
  return c[0] + c[1] * t + c[2] * t * t;
}

function residuals(points: readonly TrajectoryPoint[], cx: Coeffs, cy: Coeffs): number[] {
  return points.map((p) => Math.hypot(p.x - evaluate(cx, p.t), p.y - evaluate(cy, p.t)));
}

/** シード付きの乱数（0 以上 1 未満） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0..n-1 から重複なしに3つ選ぶ */
function sampleThree(n: number, random: () => number): number[] {
  const pick = (exclude: readonly number[]): number => {
    const k = Math.floor(random() * n);
    return exclude.includes(k) ? pick(exclude) : k;
  };
  const a = pick([]);
  const b = pick([a]);
  return [a, b, pick([a, b])];
}

function bestInlierMask(
  points: readonly TrajectoryPoint[],
  threshold: number,
  iterations: number,
  random: () => number,
): { readonly mask: readonly boolean[] | null; readonly count: number } {
  let best: { readonly mask: readonly boolean[] | null; readonly count: number } = { mask: null, count: 0 };
  for (let i = 0; i < iterations; i++) {
    const sample = sampleThree(points.length, random).map((k) => points[k]);
    const ts = sample.map((p) => p.t);
    if (new Set(ts).size < 3) continue; // 同じ時刻の点が混ざると解けない
    const cx = fitQuadratic(ts, sample.map((p) => p.x));
    const cy = fitQuadratic(ts, sample.map((p) => p.y));
    const mask = residuals(points, cx, cy).map((r) => r < threshold);
    const count = mask.filter(Boolean).length;
    if (count > best.count) best = { mask, count };
  }
  return best;
}

export function ransacFit(
  points: readonly TrajectoryPoint[],
  inlierThreshold: number,
  opts: { readonly iterations?: number; readonly seed?: number } = {},
): FitResult {
  if (points.length < MIN_POINTS_FOR_FIT) {
    throw new FitError(`フィットには最低${MIN_POINTS_FOR_FIT}点必要です（入力: ${points.length}点）`);
  }
  const ts = points.map((p) => p.t);
  if (Math.max(...ts) - Math.min(...ts) <= 0) {
    throw new FitError('全ての点が同一時刻です。時系列データを渡してください');
  }
  const { mask, count } = bestInlierMask(points, inlierThreshold, opts.iterations ?? RANSAC_ITERATIONS, mulberry32(opts.seed ?? 0));
  if (!mask || count < MIN_POINTS_FOR_FIT) {
    throw new FitError(`軌跡に乗る点が${MIN_POINTS_FOR_FIT}点未満でした（最良: ${count}点）`);
  }
  const inliers = points.filter((_, i) => mask[i]);
  const outliers = points.filter((_, i) => !mask[i]);
  const its = inliers.map((p) => p.t);
  const coeffsX = fitQuadratic(its, inliers.map((p) => p.x));
  const coeffsY = fitQuadratic(its, inliers.map((p) => p.y));
  const rmse = Math.sqrt(sum(residuals(inliers, coeffsX, coeffsY).map((r) => r * r)) / inliers.length);
  return { coeffsX, coeffsY, inliers, outliers, rmse };
}

export function positionAt(fit: FitResult, t: number): [number, number] {
  return [evaluate(fit.coeffsX, t), evaluate(fit.coeffsY, t)];
}

/** インライアの時間範囲で、欠けたコマをフィットした曲線で補う（frame 順） */
export function interpolateGaps(fit: FitResult, fps: number): CompletedPoint[] {
  if (!(fps > 0)) throw new FitError(`fpsは正の値が必要です（入力: ${fps}）`);
  const sorted = [...fit.inliers].sort((a, b) => a.frame - b.frame);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const detected = new Set(sorted.map((p) => p.frame));
  const filled = Array.from({ length: Math.max(0, last.frame - first.frame - 1) }, (_, i) => first.frame + 1 + i)
    .filter((frame) => !detected.has(frame))
    .map((frame) => {
      const t = first.t + (frame - first.frame) / fps;
      const [x, y] = positionAt(fit, t);
      return { frame, t, x, y, interpolated: true };
    });
  return [...sorted.map((p) => ({ ...p, interpolated: false })), ...filled].sort((a, b) => a.frame - b.frame);
}

/**
 * リリース〜捕球の平均球速（km/h）。単眼カメラでは奥行きが取れないため、
 * インライアの時間幅が投本間の移動時間に当たると仮定した平均値。
 */
export function estimateSpeedKmh(fit: FitResult, distanceM: number = PITCH_DISTANCE_M): number {
  const ts = fit.inliers.map((p) => p.t);
  const duration = Math.max(...ts) - Math.min(...ts);
  if (duration <= 0) throw new FitError('軌跡の時間幅が0です。球速を推定できません');
  return (distanceM / duration) * 3.6;
}
