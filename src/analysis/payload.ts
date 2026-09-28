/**
 * 比較ビューア用のデータ（pitching/visualization/viewer.py の build_payload の移植）。
 * 表示のための正規化:
 * - 原点は足接地（無ければ先頭から）の股関節中点
 * - 単位は身体サイズ（両肩間距離の中央値）
 * - X は打者方向が正、Y は上が正（画像の Y は下向きなので反転）
 */

import type { PanelKey, PitchAnalysis } from './analyzePitch';
import { leadSideOf } from './analyzePitch';
import type { EventName } from './events';
import { facingSign, midpoint, type Point } from './geometry';
import { pointAt } from './tracks';

export const PANEL_SERIES: Readonly<Record<PanelKey, string>> = {
  elbow_angle_deg: '肘角度',
  forearm_angle_deg: '前腕角度',
  trunk_lean_deg: '体幹傾き',
  lead_knee_angle_deg: '前脚膝角度',
  elbow_extension_velocity_deg_per_sec: '肘伸展角速度',
};

export const SKELETON_EDGES: readonly (readonly [string, string])[] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

export const NORMALIZED_SAMPLES = 101;

export class ViewerDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ViewerDataError';
  }
}

export type XY = [number, number];

export interface ViewerFrame {
  readonly f: number;
  readonly t: number;
  readonly p: number | null;
  readonly k: Readonly<Record<string, XY>>;
}

export interface ViewerPitch {
  readonly pitch_id: string;
  readonly label: string;
  readonly display_name: string;
  readonly description: string;
  readonly fps: number;
  readonly throwing_hand: 'right' | 'left';
  readonly throwing_side: 'right' | 'left';
  readonly lead_side: 'right' | 'left';
  readonly batter_direction: 'left' | 'right';
  readonly scale_px: number;
  readonly scale_mode: string;
  readonly events: Readonly<Record<EventName, { frame: number | null; source: string }>>;
  readonly frames: readonly ViewerFrame[];
  readonly normalized: readonly { p: number; k: Readonly<Record<string, XY>> }[] | null;
  readonly series: Readonly<Partial<Record<PanelKey, readonly (number | null)[]>>>;
}

export interface ViewerPayload {
  readonly edges: readonly (readonly [string, string])[];
  readonly panel_series: Readonly<Record<PanelKey, string>>;
  readonly normalized_samples: number;
  readonly pitches: readonly ViewerPitch[];
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
const jsonNumber = (v: number) => (Number.isFinite(v) ? round(v, 4) : null);

function referenceFrame(a: PitchAnalysis): { origin: Point; scale: number } {
  const scale = a.scalePx;
  if (scale === null || !Number.isFinite(scale) || scale <= 0) {
    throw new ViewerDataError(
      '肩が写っているコマが無いため、比較用に大きさをそろえられません。投手の上半身が写った動画で試してください',
    );
  }
  const anchor = a.events.foot_contact.frame === null ? -1 : a.frameIndices.indexOf(a.events.foot_contact.frame);
  const positions = [...(anchor >= 0 ? [anchor] : []), ...a.frameIndices.map((_, i) => i)];
  for (const position of positions) {
    const origin = midpoint(pointAt(a.smoothed, 'left_hip', position), pointAt(a.smoothed, 'right_hip', position));
    if (origin) return { origin, scale };
  }
  throw new ViewerDataError('腰が写っているコマが無いため、比較の基準点を決められません。投手の全身が写った動画で試してください');
}

function displayFrames(a: PitchAnalysis, origin: Point, scale: number, sign: number): ViewerFrame[] {
  return a.frameIndices.map((f, position) => {
    const k: Record<string, XY> = {};
    a.smoothed.names.forEach((name) => {
      const p = pointAt(a.smoothed, name, position);
      if (!p) return;
      k[name] = [round(((p[0] - origin[0]) * sign) / scale, 4), round(-(p[1] - origin[1]) / scale, 4)];
    });
    const progress = a.progress[position];
    return {
      f,
      t: round(a.timestamps[position], 4),
      p: Number.isFinite(progress) ? round(progress, 3) : null,
      k,
    };
  });
}

/** np.interp(x, xp, fp, left=nan, right=nan) と同じ（xp は昇順） */
function interp(x: number, xp: readonly number[], fp: readonly number[]): number {
  const n = xp.length;
  if (x < xp[0] || x > xp[n - 1]) return Number.NaN;
  if (x === xp[n - 1]) return fp[n - 1];
  let j = 0;
  while (j < n - 2 && xp[j + 1] <= x) j += 1;
  const span = xp[j + 1] - xp[j];
  return span === 0 ? fp[j] : fp[j] + ((fp[j + 1] - fp[j]) * (x - xp[j])) / span;
}

function normalizedFrames(frames: readonly ViewerFrame[]): ViewerPitch['normalized'] {
  const inside = frames.filter((fr) => fr.p !== null);
  if (inside.length < 2) return null;
  const grid = Array.from({ length: NORMALIZED_SAMPLES }, (_, i) => (i * 100) / (NORMALIZED_SAMPLES - 1));
  const ordered = [...inside].sort((a, b) => (a.p as number) - (b.p as number));
  const names = [...new Set(frames.flatMap((fr) => Object.keys(fr.k)))].sort();
  const resampled: Record<string, (XY | null)[]> = {};
  names.forEach((name) => {
    const valid = ordered.filter((fr) => fr.k[name] !== undefined);
    if (valid.length < 2) {
      resampled[name] = grid.map(() => null);
      return;
    }
    const xp = valid.map((fr) => fr.p as number);
    const xs = valid.map((fr) => fr.k[name][0]);
    const ys = valid.map((fr) => fr.k[name][1]);
    resampled[name] = grid.map((g) => {
      const x = interp(g, xp, xs);
      const y = interp(g, xp, ys);
      return Number.isFinite(x) && Number.isFinite(y) ? [round(x, 4), round(y, 4)] : null;
    });
  });
  return grid.map((g, i) => {
    const k: Record<string, XY> = {};
    names.forEach((name) => {
      const v = resampled[name][i];
      if (v) k[name] = v;
    });
    return { p: round(g, 2), k };
  });
}

function pitchPayload(a: PitchAnalysis): ViewerPitch {
  const c = a.config;
  const sign = facingSign(c.batterDirection);
  const { origin, scale } = referenceFrame(a);
  const frames = displayFrames(a, origin, scale, sign);
  const events = Object.fromEntries(
    Object.entries(a.events).map(([name, e]) => [name, { frame: e.frame, source: e.source }]),
  ) as ViewerPitch['events'];
  return {
    pitch_id: c.pitchId,
    label: c.label,
    display_name: c.label ? `${c.pitchId} (${c.label})` : c.pitchId,
    description: '',
    fps: c.fps,
    throwing_hand: c.throwingHand,
    throwing_side: c.throwingHand,
    lead_side: leadSideOf(c.throwingHand),
    batter_direction: c.batterDirection,
    scale_px: scale,
    scale_mode: 'shoulder_width',
    events,
    frames,
    normalized: normalizedFrames(frames),
    series: Object.fromEntries(
      (Object.keys(PANEL_SERIES) as PanelKey[]).map((key) => [key, a.series[key].map(jsonNumber)]),
    ),
  };
}

export function buildViewerPayload(analyses: readonly PitchAnalysis[]): ViewerPayload {
  if (analyses.length === 0) throw new ViewerDataError('比べる投球がありません');
  if (analyses.length > 2) throw new ViewerDataError('比べられるのは2本までです');
  return {
    edges: SKELETON_EDGES,
    panel_series: PANEL_SERIES,
    normalized_samples: NORMALIZED_SAMPLES,
    pitches: analyses.map(pitchPayload),
  };
}
