/**
 * 前処理（pitching/preprocessing の移植）。どれも新しい Tracks を返し、入力は書き換えない。
 * - 信頼度が閾値未満の座標を欠損にする（信頼度は残す）
 * - 短い欠損だけ線形補間する（長い欠損・先頭/末尾の欠損は外挿になるので埋めない）
 * - 有効値が続く区間ごとに Savitzky-Golay で平滑化する（欠損をまたがない）
 */

import { savgolFilter } from './savgol';
import type { Tracks } from './types';

type XY = readonly [number, number];

const isMissing = (p: XY) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]);

function mapXY(tracks: Tracks, fn: (name: string, points: readonly XY[]) => XY[]): Tracks {
  const xy = Object.fromEntries(tracks.names.map((name) => [name, fn(name, tracks.xy[name])]));
  return { ...tracks, xy };
}

/** true が連続する区間（閉区間）のリスト */
export function trueRuns(mask: readonly boolean[]): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;
  mask.forEach((flag, i) => {
    if (flag && start === null) start = i;
    else if (!flag && start !== null) {
      runs.push([start, i - 1]);
      start = null;
    }
  });
  if (start !== null) runs.push([start, mask.length - 1]);
  return runs;
}

export function applyThreshold(tracks: Tracks, threshold: number): Tracks {
  return mapXY(tracks, (name, points) =>
    points.map((p, i) => (tracks.confidence[name][i] < threshold ? ([Number.NaN, Number.NaN] as const) : p)),
  );
}

export function interpolateShortGaps(tracks: Tracks, maxGap: number): Tracks {
  if (maxGap < 0) throw new Error(`maxGap は 0 以上: ${maxGap}`);
  return mapXY(tracks, (_name, points) => {
    const out = [...points];
    for (const [start, end] of trueRuns(points.map(isMissing))) {
      const length = end - start + 1;
      if (length > maxGap || start === 0 || end === points.length - 1) continue;
      const before = out[start - 1];
      const after = out[end + 1];
      const steps = end - start + 2;
      for (let offset = 1; offset < steps; offset++) {
        const ratio = offset / steps;
        out[start - 1 + offset] = [
          before[0] + (after[0] - before[0]) * ratio,
          before[1] + (after[1] - before[1]) * ratio,
        ];
      }
    }
    return out;
  });
}

/** 区間長に収まる奇数の窓長。平滑化できないなら null。 */
export function normalizeWindow(window: number, segmentLength: number, polyorder: number): number | null {
  let w = Math.min(window, segmentLength);
  if (w % 2 === 0) w -= 1;
  if (w <= polyorder || w < 3) return null;
  return w;
}

export function smoothValues(values: readonly number[], window: number, polyorder: number): number[] {
  const out = [...values];
  for (const [start, end] of trueRuns(values.map((v) => Number.isFinite(v)))) {
    const segment = values.slice(start, end + 1);
    const w = normalizeWindow(window, segment.length, polyorder);
    if (w === null) continue;
    savgolFilter(segment, w, polyorder).forEach((v, i) => {
      out[start + i] = v;
    });
  }
  return out;
}

export function smoothTracks(tracks: Tracks, window: number, polyorder: number): Tracks {
  return mapXY(tracks, (_name, points) => {
    const xs = smoothValues(points.map((p) => p[0]), window, polyorder);
    const ys = smoothValues(points.map((p) => p[1]), window, polyorder);
    return xs.map((x, i) => [x, ys[i]] as const);
  });
}
