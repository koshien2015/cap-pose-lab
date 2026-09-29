/**
 * YOLOv8 検出モデルの出力 [1, 4+nc, N]（NMS 前、チャンネルが先の並び）を検出のリストにする。
 * ultralytics の non_max_suppression と同じ規則:
 * アンカーごとに最大のクラスを1つ採る（同点は番号の小さい方）→ 信頼度が閾値「より大きい」ものだけ残す →
 * クラスごとに IoU > 0.7 の重なりを消す → 信頼度の高い順に最大 300 件。
 */

import { type Letterbox, toSourceX, toSourceY } from '../inference/letterbox';

export const DETECT_CONF = 0.15;
export const NMS_IOU = 0.7;
export const MAX_DET = 300;

/** x1, y1, x2, y2 */
export type Box = readonly [number, number, number, number];

export interface Detection {
  readonly box: Box;
  readonly score: number;
  readonly cls: number;
}

export interface NmsOptions {
  readonly conf?: number;
  readonly iou?: number;
  readonly maxDet?: number;
}

function bestClass(output: Float32Array, n: number, numClasses: number, anchor: number): { cls: number; score: number } {
  let cls = 0;
  let score = output[4 * n + anchor];
  for (let c = 1; c < numClasses; c++) {
    const s = output[(4 + c) * n + anchor];
    if (s > score) {
      cls = c;
      score = s;
    }
  }
  return { cls, score };
}

function candidates(output: Float32Array, numClasses: number, conf: number): Detection[] {
  const rows = 4 + numClasses;
  if (output.length % rows !== 0) throw new Error(`出力の長さが ${rows} の倍数ではありません: ${output.length}`);
  const n = output.length / rows;
  // 出力は float32。ultralytics（torch）は閾値も float32 で比べるので、閾値を float32 に丸めてから比べる
  const threshold = Math.fround(conf);
  const found: Detection[] = [];
  for (let a = 0; a < n; a++) {
    const { cls, score } = bestClass(output, n, numClasses, a);
    if (!(score > threshold)) continue;
    const [cx, cy, w, h] = [output[a], output[n + a], output[2 * n + a], output[3 * n + a]];
    found.push({ box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], score, cls });
  }
  return found;
}

export function iou(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = w * h;
  const area = (r: Box) => (r[2] - r[0]) * (r[3] - r[1]);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

export function nonMaxSuppression(output: Float32Array, numClasses: number, opts: NmsOptions = {}): Detection[] {
  const { conf = DETECT_CONF, iou: iouThreshold = NMS_IOU, maxDet = MAX_DET } = opts;
  const sorted = [...candidates(output, numClasses, conf)].sort((a, b) => b.score - a.score);
  const kept = sorted.reduce<Detection[]>(
    (acc, d) => (acc.some((k) => k.cls === d.cls && iou(k.box, d.box) > iouThreshold) ? acc : [...acc, d]),
    [],
  );
  return kept.slice(0, maxDet);
}

/** NMS をかけ、座標をレターボックス前の表示座標に戻す */
export function decodeDetections(output: Float32Array, numClasses: number, lb: Letterbox, opts?: NmsOptions): Detection[] {
  return nonMaxSuppression(output, numClasses, opts).map((d) => ({
    ...d,
    box: [toSourceX(d.box[0], lb), toSourceY(d.box[1], lb), toSourceX(d.box[2], lb), toSourceY(d.box[3], lb)],
  }));
}
