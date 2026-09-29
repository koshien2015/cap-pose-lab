/**
 * テスト用の合成スイング（実在の映像は使わない）。捕手の後方から見た打者の骨格を作る。
 * 右打者の画像座標で作り（x はホームベース側＝右が正）、左打者は左右を反転して、左右の関節名を入れ替える。
 * 腰と肩は、真上から見て 0°（構え。両肩が奥行き方向に重なる）→ 90°（投手側を向く）へシグモイドで回る。
 * テストからだけ使う。
 */

import type { PoseJsonInput } from '../analysis/types';
import type { Bats } from './analyzeSwing';

export const SWING_FPS = 60;
/** 胴の長さ（肩の中点〜腰の中点、画素） */
export const SWING_TORSO = 100;
const WIDTH = 1000;
const CENTER_X = 500;
const SHOULDER_Y = 500;
const HIP_Y = SHOULDER_Y + SWING_TORSO;
const HEAD_Y = 440;
const ANKLE_Y = 800;
/** 投手側を向いたときの肩幅・腰幅の半分（画素）。開きの最大は 2*40/100 = 0.8、腰は 0.6 */
export const SHOULDER_HALF = 40;
export const HIP_HALF = 30;
const EAR_HALF = 8;

export interface SwingSpec {
  readonly bats: Bats;
  /** コマ数（既定 60） */
  readonly frames?: number;
  /** 腰が一番速く回るコマ（既定 28） */
  readonly hipTurnFrame?: number;
  /** 肩が一番速く回るコマ（既定 34） */
  readonly shoulderTurnFrame?: number;
  /** 頭の左右の動き（胴の長さ単位、ホームベース側が正）。既定 0 */
  readonly headDx?: (frame: number) => number;
  /** 前足首の左右の動き（胴の長さ単位、ホームベース側が正）。既定 0 */
  readonly leadAnkleDx?: (frame: number) => number;
  /** 写らなかった関節（実際の関節名）とコマ */
  readonly missing?: readonly { readonly name: string; readonly frames: readonly number[] }[];
}

const turn = (frame: number, center: number) => Math.PI / 2 / (1 + Math.exp(-(frame - center) / 3));

type Role = 'lead' | 'rear';

function nameOf(role: Role, part: string, bats: Bats): string {
  const lead = bats === 'right' ? 'left' : 'right';
  const rear = lead === 'left' ? 'right' : 'left';
  return `${role === 'lead' ? lead : rear}_${part}`;
}

export function syntheticSwing(spec: SwingSpec): PoseJsonInput {
  const count = spec.frames ?? 60;
  const hipAt = spec.hipTurnFrame ?? 28;
  const shoulderAt = spec.shoulderTurnFrame ?? 34;
  const headDx = spec.headDx ?? (() => 0);
  const ankleDx = spec.leadAnkleDx ?? (() => 0);
  const mirror = (x: number) => (spec.bats === 'right' ? x : WIDTH - x);
  const isMissing = (name: string, frame: number) =>
    (spec.missing ?? []).some((m) => m.name === name && m.frames.includes(frame));
  return {
    meta: { fps: SWING_FPS, pitch_id: `synthetic_${spec.bats}` },
    frames: Array.from({ length: count }, (_, f) => {
      const hip = Math.sin(turn(f, hipAt));
      const shoulder = Math.sin(turn(f, shoulderAt));
      const headX = CENTER_X + headDx(f) * SWING_TORSO;
      const roles: Readonly<Record<string, readonly [number, number]>> = {
        'lead:shoulder': [CENTER_X - SHOULDER_HALF * shoulder, SHOULDER_Y],
        'rear:shoulder': [CENTER_X + SHOULDER_HALF * shoulder, SHOULDER_Y],
        'lead:hip': [CENTER_X - HIP_HALF * hip, HIP_Y],
        'rear:hip': [CENTER_X + HIP_HALF * hip, HIP_Y],
        'lead:ear': [headX - EAR_HALF, HEAD_Y],
        'rear:ear': [headX + EAR_HALF, HEAD_Y],
        'lead:wrist': [CENTER_X + 20 + f, 470],
        'rear:wrist': [CENTER_X + 30 + f, 480],
        'lead:ankle': [CENTER_X - 20 + ankleDx(f) * SWING_TORSO, ANKLE_Y],
        'rear:ankle': [CENTER_X + 20, ANKLE_Y],
      };
      const keypoints = Object.fromEntries(
        Object.entries(roles).map(([key, [x, y]]) => {
          const [role, part] = key.split(':') as [Role, string];
          const name = nameOf(role, part, spec.bats);
          const value: readonly [number | null, number | null, number] = isMissing(name, f) ? [null, null, 0] : [mirror(x), y, 0.9];
          return [name, value];
        }),
      );
      return { frame_index: f, timestamp_sec: f / SWING_FPS, keypoints };
    }),
  };
}
