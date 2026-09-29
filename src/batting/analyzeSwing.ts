/**
 * 打者のスイング1本分の解析（設計書 §14）。投手の解析（analysis/analyzePitch.ts）とは分け、前処理だけ共通で使う。
 * 流れ: 信頼度フィルタ → 短い欠損の補間 → 平滑化 → 瞬間（手動指定のみ）→ 進行率（トップ=0%、インパクト=100%）→ 胴の長さ。
 */

import { PREPROCESSING } from '../analysis/analyzePitch';
import { progressPercent } from '../analysis/events';
import { distance, midpoint } from '../analysis/geometry';
import { applyThreshold, interpolateShortGaps, smoothTracks } from '../analysis/preprocess';
import { pointAt, tracksFromPoseJson } from '../analysis/tracks';
import type { PoseJsonInput, Tracks } from '../analysis/types';

export type Bats = 'right' | 'left';

export interface SwingConfig {
  readonly swingId: string;
  readonly label: string;
  readonly bats: Bats;
  readonly fps: number;
  readonly topFrame: number | null;
  readonly impactFrame: number | null;
}

export type SwingEventName = 'swing_start' | 'top' | 'impact' | 'swing_end';

export interface SwingEvent {
  readonly name: SwingEventName;
  readonly frame: number | null;
  readonly source: 'manual';
}

export interface SwingAnalysis {
  readonly config: SwingConfig;
  readonly smoothed: Tracks;
  readonly events: Readonly<Record<SwingEventName, SwingEvent>>;
  /** トップ=0%、インパクト=100% の進行率（区間外は NaN） */
  readonly progress: readonly number[];
  /** 胴の長さ（画素）。決まらなければ null */
  readonly torsoPx: number | null;
}

export function validateSwingEvents(top: number | null, impact: number | null): string | null {
  if (top !== null && impact !== null && impact <= top) return 'インパクトはトップより後のコマにしてください';
  return null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 胴の長さ（肩の中点〜腰の中点の距離の、全コマでの中央値、画素）。回転で変わる肩幅の代わりに大きさの基準にする */
export function torsoLength(t: Tracks): number | null {
  const values = t.frameIndices
    .map((_, i) =>
      distance(
        midpoint(pointAt(t, 'left_shoulder', i), pointAt(t, 'right_shoulder', i)),
        midpoint(pointAt(t, 'left_hip', i), pointAt(t, 'right_hip', i)),
      ),
    )
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length === 0) return null;
  const length = median(values);
  return length > 0 ? length : null;
}

export function analyzeSwing(json: PoseJsonInput, config: SwingConfig): SwingAnalysis {
  const p = PREPROCESSING;
  const smoothed = smoothTracks(
    interpolateShortGaps(applyThreshold(tracksFromPoseJson(json), p.confidenceThreshold), p.maxGapFrames),
    p.smoothingWindow,
    p.smoothingPolyorder,
  );
  const frames = smoothed.frameIndices;
  const positionOf = (frame: number | null) => {
    if (frame === null) return null;
    const i = frames.indexOf(frame);
    return i < 0 ? null : i;
  };
  const event = (name: SwingEventName, frame: number | null): SwingEvent => ({ name, frame, source: 'manual' });
  return {
    config,
    smoothed,
    events: {
      swing_start: event('swing_start', frames.length > 0 ? frames[0] : null),
      top: event('top', config.topFrame),
      impact: event('impact', config.impactFrame),
      swing_end: event('swing_end', frames.length > 0 ? frames[frames.length - 1] : null),
    },
    progress: progressPercent(frames.length, positionOf(config.topFrame), positionOf(config.impactFrame)),
    torsoPx: torsoLength(smoothed),
  };
}
