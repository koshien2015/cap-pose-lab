/**
 * YOLO26 Pose（end2end・NMS 不要）の出力 [1, 300, 57] を人物のリストにする。
 * 1行 = [x1, y1, x2, y2, score, cls, (kx, ky, kconf) x 17]。座標は入力（レターボックス後）画素。
 */

import { type Letterbox, toSourceX, toSourceY } from './letterbox';

export const NUM_KEYPOINTS = 17;
const ROW = 6 + NUM_KEYPOINTS * 3;

export type Keypoint = readonly [x: number, y: number, conf: number];

export interface Person {
  readonly box: readonly [number, number, number, number];
  readonly score: number;
  readonly keypoints: readonly Keypoint[];
}

export function decodePeople(output: Float32Array, lb: Letterbox, confThreshold: number): Person[] {
  if (output.length % ROW !== 0) {
    throw new Error(`出力の長さが ${ROW} の倍数ではありません: ${output.length}`);
  }
  const people: Person[] = [];
  for (let offset = 0; offset < output.length; offset += ROW) {
    const score = output[offset + 4];
    if (score < confThreshold) continue;
    const keypoints: Keypoint[] = [];
    for (let k = 0; k < NUM_KEYPOINTS; k++) {
      const base = offset + 6 + k * 3;
      keypoints.push([toSourceX(output[base], lb), toSourceY(output[base + 1], lb), output[base + 2]]);
    }
    people.push({
      box: [
        toSourceX(output[offset], lb),
        toSourceY(output[offset + 1], lb),
        toSourceX(output[offset + 2], lb),
        toSourceY(output[offset + 3], lb),
      ],
      score,
      keypoints,
    });
  }
  return people;
}
