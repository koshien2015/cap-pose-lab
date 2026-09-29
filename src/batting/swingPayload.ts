/**
 * 打者の比較用データ（設計書 §14.3）。比較画面は投手と共通で、打者の文言・関節・まとめを省略できる項目で渡す。
 */

import {
  jsonNumber, NORMALIZED_SAMPLES, normalizedFrames, SKELETON_EDGES, ViewerDataError, type ViewerPayload, type ViewerPitch,
} from '../analysis/payload';
import type { SwingAnalysis } from './analyzeSwing';
import { HANDS, leadSideOf, swingFrames, swingOrigin } from './swingFrames';
import { SWING_PANELS, type SwingPanelKey, swingSeries } from './swingSeries';
import { swingSummary } from './swingSummary';

export const BATTER_EVENT_LABELS: Readonly<Record<string, string>> = { top: 'トップ', impact: 'インパクト' };

export const BATTER_READING_NOTES: readonly string[] = [
  '座標は胴の長さ（肩の中点から腰の中点まで）を 1 とした値です。原点は構え（動画の先頭）のときの腰の中心で、ホームベース側を右、上を上にそろえています（左打者は左右を反転しています）。',
  '「開き」は、捕手の後ろから見た肩幅・腰幅の写り方から見た値で、角度ではありません。投手の方向（奥行き）の動きは測れません。2本の差は観測された違いで、原因を示すものではありません。',
  'カメラが打者に近いと、まっすぐ踏み出しても「踏み込みの向き」が「閉じ」寄りに出て、構えの「開き」も 0 から少しずれます（打者が画面の中心から外れた位置に立つため）。数メートル以上離れて撮ると小さくなります。',
  '打者の横にいる主審・捕手を途中から追ってしまうことがあります。骨格が急に別の場所へ飛んだら、解析結果の画面で打者をタップして選び直してください。',
];

function positionOf(a: SwingAnalysis, frame: number | null): number | null {
  if (frame === null) return null;
  const i = a.smoothed.frameIndices.indexOf(frame);
  return i < 0 ? null : i;
}

function swingPitch(a: SwingAnalysis): ViewerPitch {
  const c = a.config;
  const scale = a.torsoPx;
  if (scale === null || !Number.isFinite(scale) || scale <= 0) {
    throw new ViewerDataError(
      '胴（肩と腰）が写っているコマが無いため、比較用に大きさをそろえられません。打者の上半身と腰が写った動画で試してください',
    );
  }
  const frames = swingFrames(a, swingOrigin(a), scale);
  const series = swingSeries(frames, c.bats);
  const window = { top: positionOf(a, c.topFrame), impact: positionOf(a, c.impactFrame) };
  return {
    pitch_id: c.swingId,
    label: c.label,
    display_name: c.label ? `${c.swingId} (${c.label})` : c.swingId,
    description: '',
    fps: c.fps,
    // 投手用の項目には、打ち方と前の側を入れる。ホームベース側を右に揃えたので、打者の向きは right
    throwing_hand: c.bats,
    throwing_side: c.bats,
    lead_side: leadSideOf(c.bats),
    batter_direction: 'right',
    scale_px: scale,
    scale_mode: 'torso_length',
    events: Object.fromEntries(Object.entries(a.events).map(([name, e]) => [name, { frame: e.frame, source: e.source }])),
    frames,
    normalized: normalizedFrames(frames),
    series: Object.fromEntries(
      (Object.keys(SWING_PANELS) as SwingPanelKey[]).map((key) => [key, series[key].map(jsonNumber)]),
    ),
    arm_joints: [HANDS],
    trail_joints: [HANDS],
    summary: swingSummary(frames, series, a.smoothed.fps, c.bats, window),
  };
}

export function buildSwingPayload(analyses: readonly SwingAnalysis[]): ViewerPayload {
  if (analyses.length === 0) throw new ViewerDataError('比べるスイングがありません');
  if (analyses.length > 2) throw new ViewerDataError('比べられるのは2本までです');
  return {
    edges: SKELETON_EDGES,
    panel_series: SWING_PANELS,
    normalized_samples: NORMALIZED_SAMPLES,
    pitches: analyses.map(swingPitch),
    subject: 'batter',
    anchor_event: 'impact',
    anchor_label: 'インパクト',
    progress_label: 'トップ→インパクト',
    progress_hint: '「進行率」は、トップとインパクトを指定すると選べます。',
    event_labels: BATTER_EVENT_LABELS,
    arm_label: '両手',
    trail_label: '手の通り道を表示する',
    reading_notes: BATTER_READING_NOTES,
    panel_digits: 2,
  };
}
