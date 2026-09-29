/**
 * 打者のグラフ6項目（設計書 §14.5）。座標は swingFrames で揃えたもの（胴の長さ = 1、ホームベース側が +X）。
 * 決まらないコマは NaN。
 */

import type { ViewerFrame, XY } from '../analysis/payload';
import type { Bats } from './analyzeSwing';
import { HANDS, leadSideOf, rearSideOf } from './swingFrames';

export type SwingPanelKey = 'shoulder_open' | 'hip_open' | 'head_x' | 'head_y' | 'hands_x' | 'hands_y';

export const SWING_PANELS: Readonly<Record<SwingPanelKey, string>> = {
  shoulder_open: '肩の開き',
  hip_open: '腰の開き',
  head_x: '頭の左右',
  head_y: '頭の上下',
  hands_x: '手の左右',
  hands_y: '手の高さ',
};

/** 頭（両耳の中点）。背面からは鼻・目が写りにくいので耳を使う。片耳でも欠けたら null */
export function headOf(k: Readonly<Record<string, XY>>): XY | null {
  const left = k.left_ear;
  const right = k.right_ear;
  return left && right ? [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2] : null;
}

/** 開き = 後ろ側の X − 前側の X（構えで 0 付近、投手側を向くほど大きい。写った幅なので角度ではない） */
function openOf(k: Readonly<Record<string, XY>>, part: 'shoulder' | 'hip', bats: Bats): number {
  const rear = k[`${rearSideOf(bats)}_${part}`];
  const lead = k[`${leadSideOf(bats)}_${part}`];
  return rear && lead ? rear[0] - lead[0] : Number.NaN;
}

export function swingSeries(frames: readonly ViewerFrame[], bats: Bats): Record<SwingPanelKey, number[]> {
  const heads = frames.map((f) => headOf(f.k));
  // 構えでの頭 = 先頭から見て頭が取れた最初のコマ
  const start = heads.find((h): h is XY => h !== null) ?? null;
  return {
    shoulder_open: frames.map((f) => openOf(f.k, 'shoulder', bats)),
    hip_open: frames.map((f) => openOf(f.k, 'hip', bats)),
    head_x: heads.map((h) => (h && start ? h[0] - start[0] : Number.NaN)),
    head_y: heads.map((h) => (h && start ? h[1] - start[1] : Number.NaN)),
    hands_x: frames.map((f) => f.k[HANDS]?.[0] ?? Number.NaN),
    hands_y: frames.map((f) => f.k[HANDS]?.[1] ?? Number.NaN),
  };
}
