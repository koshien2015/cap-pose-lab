/**
 * pose.json → キーポイントごとの時系列（pitching/preprocessing/tracks.py の from_series と
 * adapters/json_adapter.py の load_pose_json の移植）。
 */

import type { Point } from './geometry';
import type { PoseJsonInput, Tracks } from './types';

const MISSING: readonly [number, number] = [Number.NaN, Number.NaN];

export function tracksFromPoseJson(json: PoseJsonInput): Tracks {
  const frames = [...json.frames].sort((a, b) => a.frame_index - b.frame_index);
  const names: string[] = [];
  frames.forEach((f) => Object.keys(f.keypoints).forEach((n) => names.includes(n) || names.push(n)));
  const xy: Record<string, (readonly [number, number])[]> = {};
  const confidence: Record<string, number[]> = {};
  names.forEach((name) => {
    xy[name] = frames.map((f) => {
      const kp = f.keypoints[name];
      if (!kp || kp[0] === null || kp[1] === null || !Number.isFinite(kp[0]) || !Number.isFinite(kp[1])) return MISSING;
      return [kp[0], kp[1]] as const;
    });
    confidence[name] = frames.map((f) => f.keypoints[name]?.[2] ?? 0);
  });
  return {
    frameIndices: frames.map((f) => f.frame_index),
    timestamps: frames.map((f) => f.timestamp_sec),
    fps: json.meta.fps,
    names,
    xy,
    confidence,
  };
}

/** 指定フレームの座標。欠損なら null。 */
export function pointAt(tracks: Tracks, name: string, position: number): Point | null {
  const p = tracks.xy[name]?.[position];
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  return p;
}
