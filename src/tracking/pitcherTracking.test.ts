import { describe, expect, it } from 'vitest';

import type { Person } from '../inference/decodePose';
import { findInitialPitcher, iou, personAtPoint, trackPitcher } from './pitcherTracking';

const person = (x1: number, y1: number, x2: number, y2: number): Person => ({
  box: [x1, y1, x2, y2],
  score: 0.9,
  keypoints: Array.from({ length: 17 }, () => [x1, y1, 0.9] as const),
});

describe('iou', () => {
  it('同じ箱は 1、離れた箱は 0', () => {
    expect(iou([0, 0, 10, 10], [0, 0, 10, 10])).toBe(1);
    expect(iou([0, 0, 10, 10], [20, 20, 30, 30])).toBe(0);
  });
});

describe('findInitialPitcher', () => {
  it('人物が写っている最初のフレームで、最も大きい人物を選ぶ', () => {
    const frames = [[], [person(0, 0, 10, 10), person(100, 0, 300, 400)]];
    expect(findInitialPitcher(frames)).toEqual({ frame: 1, index: 1 });
  });

  it('誰も写っていなければ null', () => {
    expect(findInitialPitcher([[], []])).toBeNull();
  });
});

describe('personAtPoint', () => {
  const people = [person(0, 0, 500, 500), person(100, 100, 200, 300)];

  it('重なっていれば小さいほう（手前の人）を選ぶ', () => {
    expect(personAtPoint(people, 150, 150)).toBe(1);
  });

  it('大きい箱だけに入る点ならそちら', () => {
    expect(personAtPoint(people, 400, 400)).toBe(0);
  });

  it('誰の箱にも入らなければ null', () => {
    expect(personAtPoint(people, 900, 900)).toBeNull();
  });
});

describe('trackPitcher', () => {
  it('前後のフレームへ、重なりの大きい人物をたどる', () => {
    const frames = [
      [person(0, 0, 100, 200), person(500, 0, 600, 200)],
      [person(5, 0, 105, 200), person(500, 0, 600, 200)],
      [person(500, 0, 600, 200), person(10, 0, 110, 200)],
    ];
    const track = trackPitcher(frames, { frame: 1, index: 0 });
    expect(track.map((p) => p?.box[0])).toEqual([0, 5, 10]);
  });

  it('見失ったフレームは null にし、別人を拾わない', () => {
    const frames = [
      [person(0, 0, 100, 200)],
      [person(800, 0, 900, 200)], // 投手は隠れていて、離れた位置の別人だけ写っている
      [person(4, 0, 104, 200)],
    ];
    const track = trackPitcher(frames, { frame: 0, index: 0 });
    expect(track[1]).toBeNull();
    expect(track[2]?.box[0]).toBe(4); // 最後に見えた位置から追跡を再開する
  });

  it('結果の長さはフレーム数と同じ', () => {
    const frames = [[person(0, 0, 10, 10)], [], [], [person(0, 0, 10, 10)]];
    expect(trackPitcher(frames, { frame: 0, index: 0 })).toHaveLength(4);
  });

  it('範囲外のアンカーは例外にする', () => {
    expect(() => trackPitcher([[person(0, 0, 1, 1)]], { frame: 0, index: 3 })).toThrow();
  });
});
