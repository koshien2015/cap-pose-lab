/**
 * 推論したコマの記録から、1球分の軌跡と平均球速を出す（SHARED の trajectory_fitter.py の analyze_pitch の組み立て部分）。
 * - 原点（t=0）はリリースのコマ。無ければ最初の検出
 * - リリースが分かっていれば、そのコマより前の検出は使わない（手の中のキャップを拾うため）。表示用の detections には残す
 * - フィットできなければ problem を返す（例外にしない）。画面が案内を出す
 */

import type { CapPoint, FrameRecord } from './records';
import {
  type CompletedPoint,
  estimateSpeedKmh,
  FitError,
  type FitResult,
  INLIER_THRESHOLD_RATIO,
  interpolateGaps,
  ransacFit,
} from './trajectory';

export const SPEED_RANGE_KMH = { min: 30, max: 150 } as const;

export type ThrowProblem = 'too_few' | 'too_few_after_release';

export interface ThrowInput {
  readonly records: readonly FrameRecord[];
  readonly fps: number;
  readonly frameHeight: number;
  readonly releaseFrame: number | null;
}

export interface ThrowAnalysis {
  readonly originFrame: number | null;
  /** キャップを検出したコマ（frame 順。リリース前も含む） */
  readonly detections: readonly CapPoint[];
  readonly fit: FitResult | null;
  readonly trajectory: readonly CompletedPoint[];
  readonly speedKmh: number | null;
  readonly speedSuspicious: boolean;
  readonly problem: ThrowProblem | null;
}

export function analyzeThrow({ records, fps, frameHeight, releaseFrame }: ThrowInput): ThrowAnalysis {
  if (!(fps > 0) || !(frameHeight > 0)) {
    throw new Error(`fps と画面の高さは正の値が必要です（fps=${fps}, height=${frameHeight}）`);
  }
  const detections = [...records].sort((a, b) => a.frame - b.frame).flatMap((r) => (r.cap ? [r.cap] : []));
  const used = releaseFrame === null ? detections : detections.filter((d) => d.frame >= releaseFrame);
  const originFrame = releaseFrame ?? detections[0]?.frame ?? null;
  const base = { originFrame, detections, fit: null, trajectory: [], speedKmh: null, speedSuspicious: false };
  const points = used.map((d) => ({ frame: d.frame, t: (d.frame - (originFrame ?? 0)) / fps, x: d.x, y: d.y }));
  try {
    const fit = ransacFit(points, frameHeight * INLIER_THRESHOLD_RATIO);
    const speedKmh = estimateSpeedKmh(fit);
    return {
      ...base,
      fit,
      trajectory: interpolateGaps(fit, fps),
      speedKmh,
      speedSuspicious: speedKmh < SPEED_RANGE_KMH.min || speedKmh > SPEED_RANGE_KMH.max,
      problem: null,
    };
  } catch (error) {
    if (!(error instanceof FitError)) throw error;
    const excluded = releaseFrame !== null && used.length < detections.length;
    return { ...base, problem: excluded ? 'too_few_after_release' : 'too_few' };
  }
}
