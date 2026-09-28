import { describe, expect, it } from 'vitest';

import { decodePeople, NUM_KEYPOINTS } from './decodePose';
import { computeLetterbox } from './letterbox';

function row(box: number[], score: number, kpt: [number, number, number]): number[] {
  return [...box, score, 0, ...Array.from({ length: NUM_KEYPOINTS }, () => kpt).flat()];
}

describe('decodePeople', () => {
  const lb = computeLetterbox(1920, 1080, 960);

  it('しきい値未満を捨て、座標を元フレームに戻す', () => {
    const out = new Float32Array([...row([10, 12, 110, 212], 0.9, [50, 102, 0.8]), ...row([0, 0, 1, 1], 0.1, [0, 0, 0])]);
    const people = decodePeople(out, lb, 0.25);
    expect(people).toHaveLength(1);
    expect(people[0].box).toEqual([20, 20, 220, 420]);
    expect(people[0].keypoints[0][0]).toBeCloseTo(100);
    expect(people[0].keypoints[0][1]).toBeCloseTo(200);
    expect(people[0].keypoints[0][2]).toBeCloseTo(0.8);
  });

  it('出力の長さが 57 の倍数でなければ例外にする', () => {
    expect(() => decodePeople(new Float32Array(10), lb, 0.25)).toThrow();
  });

  it('誰もいなければ空配列', () => {
    expect(decodePeople(new Float32Array(row([0, 0, 1, 1], 0.1, [0, 0, 0])), lb, 0.25)).toEqual([]);
  });
});
