/**
 * 1投球分の解析（pitching/analysis.py の analyze_pitch のうち、ビューアに要る部分の移植）。
 * 流れ: 信頼度フィルタ → 短い欠損の補間 → 平滑化 → 角度系列 → イベント → 進行率。
 */

import { type EventName, type PitchEvent, progressPercent, resolveEvents } from './events';
import { facingSign } from './geometry';
import { applyThreshold, interpolateShortGaps, smoothTracks } from './preprocess';
import {
  bodyScale, elbowAngleSeries, extensionVelocity, forearmAngleSeries, leadKneeAngleSeries, trunkLeanSeries,
} from './series';
import { tracksFromPoseJson } from './tracks';
import type { PoseJsonInput, Tracks } from './types';

/** pitching/config.py の既定値 */
export const PREPROCESSING = { confidenceThreshold: 0.5, maxGapFrames: 3, smoothingWindow: 9, smoothingPolyorder: 2 } as const;

export type Hand = 'right' | 'left';

export interface PitchConfig {
  readonly pitchId: string;
  readonly label: string;
  readonly throwingHand: Hand;
  /** 打者（捕手）が画像のどちら側にいるか */
  readonly batterDirection: 'left' | 'right';
  readonly fps: number;
  readonly footContactFrame: number | null;
  readonly releaseFrame: number | null;
}

export type PanelKey =
  | 'elbow_angle_deg'
  | 'forearm_angle_deg'
  | 'trunk_lean_deg'
  | 'lead_knee_angle_deg'
  | 'elbow_extension_velocity_deg_per_sec';

export interface PitchAnalysis {
  readonly config: PitchConfig;
  readonly frameIndices: readonly number[];
  readonly timestamps: readonly number[];
  readonly smoothed: Tracks;
  readonly series: Readonly<Record<PanelKey, readonly number[]>>;
  readonly events: Readonly<Record<EventName, PitchEvent>>;
  readonly progress: readonly number[];
  readonly scalePx: number | null;
}

export const leadSideOf = (hand: Hand): Hand => (hand === 'right' ? 'left' : 'right');

export function analyzePitch(json: PoseJsonInput, config: PitchConfig): PitchAnalysis {
  const p = PREPROCESSING;
  const raw = tracksFromPoseJson(json);
  const smoothed = smoothTracks(
    interpolateShortGaps(applyThreshold(raw, p.confidenceThreshold), p.maxGapFrames),
    p.smoothingWindow,
    p.smoothingPolyorder,
  );
  const sign = facingSign(config.batterDirection);
  const elbow = elbowAngleSeries(smoothed, config.throwingHand);
  const events = resolveEvents(smoothed.frameIndices, elbow, {
    footContactFrame: config.footContactFrame,
    releaseFrame: config.releaseFrame,
  });
  const position = (frame: number | null) => (frame === null ? null : smoothed.frameIndices.indexOf(frame));
  const contact = position(events.foot_contact.frame);
  const release = position(events.release.frame);
  return {
    config,
    frameIndices: smoothed.frameIndices,
    timestamps: smoothed.timestamps,
    smoothed,
    series: {
      elbow_angle_deg: elbow,
      forearm_angle_deg: forearmAngleSeries(smoothed, config.throwingHand, sign),
      trunk_lean_deg: trunkLeanSeries(smoothed, sign),
      lead_knee_angle_deg: leadKneeAngleSeries(smoothed, leadSideOf(config.throwingHand)),
      elbow_extension_velocity_deg_per_sec: extensionVelocity(elbow, smoothed.fps),
    },
    events,
    progress: progressPercent(
      smoothed.frameIndices.length,
      contact !== null && contact >= 0 ? contact : null,
      release !== null && release >= 0 ? release : null,
    ),
    scalePx: bodyScale(smoothed),
  };
}
