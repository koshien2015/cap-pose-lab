/**
 * テスト用の合成投球（実在の映像は使わない）。
 * リリース前は投手が motion、リリースのコマから 5 コマは release、その後キャップが放物線を描いて飛ぶ。
 * 推論したコマの記録だけを frame 順に返す。テストからだけ使う。
 */

import type { FrameRecord, PitcherState } from './records';

export const SYNTH_WIDTH = 1920;
export const SYNTH_HEIGHT = 1080;
export const SYNTH_FPS = 60;
export const SYNTH_RELEASE = 100;

export interface SyntheticThrowOptions {
  /** 飛んでいるコマ数（既定 24 = 0.4 秒） */
  readonly flightFrames?: number;
  readonly frameCount?: number;
  /** キャップを見失うコマ */
  readonly missing?: readonly number[];
  /** 誤検出にするコマ（軌跡から大きく外れた位置） */
  readonly outliers?: readonly number[];
  /** リリース前に、投手の手の中のキャップを拾うコマ */
  readonly capInHand?: readonly number[];
  /** 推論したコマ（既定: 全コマ） */
  readonly inferred?: (frame: number) => boolean;
  /** 検出位置のずれ（コマごと） */
  readonly jitter?: (frame: number) => readonly [number, number];
}

export function capPosition(t: number): [number, number] {
  return [900 + 300 * t - 50 * t * t, 400 + 200 * t + 600 * t * t];
}

function pitcherAt(frame: number): PitcherState {
  if (frame < SYNTH_RELEASE) return 'motion';
  return frame < SYNTH_RELEASE + 5 ? 'release' : null;
}

function capAt(frame: number, o: SyntheticThrowOptions): FrameRecord['cap'] {
  const flight = o.flightFrames ?? 24;
  if (o.capInHand?.includes(frame)) return { frame, x: 500, y: 600, conf: 0.4 };
  const flying = frame > SYNTH_RELEASE && frame <= SYNTH_RELEASE + flight && !o.missing?.includes(frame);
  if (!flying) return null;
  const [x, y] = capPosition((frame - SYNTH_RELEASE) / SYNTH_FPS);
  const [dx, dy] = o.outliers?.includes(frame) ? [300, -200] : (o.jitter?.(frame) ?? [0, 0]);
  return { frame, x: x + dx, y: y + dy, conf: 0.5 };
}

export function syntheticThrow(o: SyntheticThrowOptions = {}): FrameRecord[] {
  return Array.from({ length: o.frameCount ?? 200 }, (_, frame) => frame)
    .filter((frame) => o.inferred?.(frame) ?? true)
    .map((frame) => ({ frame, cap: capAt(frame, o), pitcher: pitcherAt(frame) }));
}
