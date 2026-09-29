/**
 * 打者の比較の段取り: pose.json（解析結果 or 保存したファイル）＋指定した瞬間 → 比較用データ。
 */

import { ViewerDataError, type ViewerPayload } from '../analysis/payload';
import type { PoseJsonInput } from '../analysis/types';
import { analyzeSwing, type SwingConfig, validateSwingEvents } from '../batting/analyzeSwing';
import { buildSwingPayload } from '../batting/swingPayload';

export interface SwingCompareInput {
  readonly json: PoseJsonInput;
  /** 動画から解析した場合の縮小画像（保存したファイルを読み込んだ場合は null） */
  readonly thumbnails: readonly ImageBitmap[] | null;
  readonly thumbStride: number;
  /** 元の映像の大きさ（縮小画像に骨格を重ねるため。無ければ骨格だけ描く） */
  readonly size?: { readonly width: number; readonly height: number } | null;
  readonly config: SwingConfig;
}

export function buildSwingComparison(inputs: readonly SwingCompareInput[]): { payload: ViewerPayload } | { error: string } {
  for (const input of inputs) {
    const problem = validateSwingEvents(input.config.topFrame, input.config.impactFrame);
    if (problem) return { error: `${input.config.swingId}: ${problem}` };
  }
  try {
    return { payload: buildSwingPayload(inputs.map((i) => analyzeSwing(i.json, i.config))) };
  } catch (error) {
    if (error instanceof ViewerDataError) return { error: error.message };
    throw error;
  }
}
