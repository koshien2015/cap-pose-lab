/**
 * 書き出す JSON（設計書 §9.5）。座標は表示ピクセル、t は原点からの秒数。
 * 係数は再現できるよう丸めずに出し、それ以外は読みやすい桁に丸める。
 */

import type { ThrowAnalysis } from './analyzeThrow';
import { DETECT_CONF } from './decodeDetect';
import type { InferenceMode } from './gate';
import type { CapPoint, FrameRecord } from './records';
import type { CompletedPoint } from './trajectory';

export type ReleaseSource = 'auto' | 'manual' | 'none';

export interface TrajectoryJsonInput {
  readonly fileName: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly model: { readonly weights: string; readonly imgsz: number; readonly preprocess: 'raw' | 'enhanced' };
  readonly inference: InferenceMode;
  readonly releaseFrame: number | null;
  readonly releaseSource: ReleaseSource;
  readonly records: readonly FrameRecord[];
  readonly analysis: ThrowAnalysis;
}

export interface TrajectoryJson {
  readonly schema: 'cap-pose-lab/trajectory';
  readonly version: 1;
  readonly video: { readonly file: string; readonly fps: number; readonly width: number; readonly height: number; readonly frameCount: number };
  readonly model: { readonly weights: string; readonly imgsz: number; readonly preprocess: 'raw' | 'enhanced'; readonly conf: number };
  /** 推論のしかた（sampled: 見つかるまで間引いた / all: 全コマ）。推論したコマは inferredFrames */
  readonly inference: InferenceMode;
  readonly release: { readonly frame: number | null; readonly source: ReleaseSource };
  readonly detections: readonly CapPoint[];
  readonly inferredFrames: readonly (readonly [number, number])[];
  readonly fit: {
    readonly coeffsX: readonly number[];
    readonly coeffsY: readonly number[];
    readonly rmse: number;
    readonly inlierFrames: readonly number[];
    readonly outlierFrames: readonly number[];
  } | null;
  readonly trajectory: readonly CompletedPoint[];
  readonly speedKmh: number | null;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

export function inferredRanges(frames: readonly number[]): [number, number][] {
  const sorted = [...new Set(frames)].sort((a, b) => a - b);
  return sorted.reduce<[number, number][]>((ranges, f) => {
    const last = ranges[ranges.length - 1];
    return last && last[1] === f ? [...ranges.slice(0, -1), [last[0], f + 1]] : [...ranges, [f, f + 1]];
  }, []);
}

export function toTrajectoryJson(input: TrajectoryJsonInput): TrajectoryJson {
  const { analysis: a } = input;
  const byFrame = (p: { frame: number }) => p.frame;
  return {
    schema: 'cap-pose-lab/trajectory',
    version: 1,
    video: { file: input.fileName, fps: input.fps, width: input.width, height: input.height, frameCount: input.frameCount },
    // manifest の項目をそのまま広げない（書き出すのはこの4つだけ）
    model: { weights: input.model.weights, imgsz: input.model.imgsz, preprocess: input.model.preprocess, conf: DETECT_CONF },
    inference: input.inference,
    release: { frame: input.releaseFrame, source: input.releaseFrame === null ? 'none' : input.releaseSource },
    detections: a.detections.map((d) => ({ frame: d.frame, x: round(d.x, 2), y: round(d.y, 2), conf: round(d.conf, 3) })),
    inferredFrames: inferredRanges(input.records.map(byFrame)),
    fit: a.fit && {
      coeffsX: [...a.fit.coeffsX],
      coeffsY: [...a.fit.coeffsY],
      rmse: round(a.fit.rmse, 2),
      inlierFrames: a.fit.inliers.map(byFrame).sort((x, y) => x - y),
      outlierFrames: a.fit.outliers.map(byFrame).sort((x, y) => x - y),
    },
    trajectory: a.trajectory.map((p) => ({ frame: p.frame, t: round(p.t, 4), x: round(p.x, 2), y: round(p.y, 2), interpolated: p.interpolated })),
    speedKmh: a.speedKmh === null ? null : round(a.speedKmh, 1),
  };
}

export function trajectoryJsonFileName(videoName: string): string {
  return `${videoName.replace(/\.[^.]+$/, '')}_trajectory.json`;
}
