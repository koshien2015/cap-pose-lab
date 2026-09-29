import { describe, expect, it } from 'vitest';

import { expectClose } from '../analysis/fixtures';
import { computeLetterbox } from '../inference/letterbox';
import { decodeDetections, decodeEnd2End, decodeOutput, nonMaxSuppression } from './decodeDetect';
import { loadCapFixture } from './fixtures';

interface NmsFixture {
  readonly ultralytics: string;
  readonly num_classes: number;
  readonly output: number[];
  readonly expected: { readonly box: number[]; readonly score: number; readonly cls: number }[];
}

interface Anchor {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly scores: Readonly<Record<number, number>>;
}

/** [4+nc][N] の並び（チャンネルが先）で出力を作る */
function makeOutput(numClasses: number, anchors: readonly Anchor[]): Float32Array {
  const n = anchors.length;
  const out = new Float32Array((4 + numClasses) * n);
  anchors.forEach((a, i) => {
    [a.cx, a.cy, a.w, a.h].forEach((v, row) => (out[row * n + i] = v));
    Object.entries(a.scores).forEach(([c, s]) => (out[(4 + Number(c)) * n + i] = s));
  });
  return out;
}

describe('nonMaxSuppression', () => {
  it('ultralytics の non_max_suppression と一致する', () => {
    const fx = loadCapFixture<NmsFixture>('nms');
    const actual = nonMaxSuppression(new Float32Array(fx.output), fx.num_classes).map((d) => ({
      box: [...d.box],
      score: d.score,
      cls: d.cls,
    }));
    expectClose(actual, fx.expected, 1e-3);
  });

  it('同じクラスで重なる枠は信頼度の高い1つだけ残し、違うクラスは両方残す', () => {
    const out = makeOutput(3, [
      { cx: 100, cy: 100, w: 20, h: 20, scores: { 0: 0.9 } },
      { cx: 102, cy: 100, w: 20, h: 20, scores: { 0: 0.8 } },
      { cx: 101, cy: 100, w: 20, h: 20, scores: { 1: 0.7 } },
    ]);
    const got = nonMaxSuppression(out, 3);
    expect(got.map((d) => [d.cls, Math.fround(d.score)])).toEqual([
      [0, Math.fround(0.9)],
      [1, Math.fround(0.7)],
    ]);
  });

  it('信頼度が閾値ちょうどのものは採らない', () => {
    const out = makeOutput(2, [{ cx: 50, cy: 50, w: 10, h: 10, scores: { 0: 0.15 } }]);
    expect(nonMaxSuppression(out, 2)).toEqual([]);
  });

  it('1つのアンカーでは最大のクラスだけを採る（同点は番号の小さい方）', () => {
    const out = makeOutput(3, [{ cx: 50, cy: 50, w: 10, h: 10, scores: { 1: 0.4, 2: 0.4 } }]);
    expect(nonMaxSuppression(out, 3).map((d) => d.cls)).toEqual([1]);
  });

  it('maxDet 件で打ち切る', () => {
    const anchors = [0.9, 0.8, 0.7, 0.6, 0.5].map((s, i) => ({ cx: 50 + i * 100, cy: 50, w: 10, h: 10, scores: { 0: s } }));
    expect(nonMaxSuppression(makeOutput(1, anchors), 1, { maxDet: 3 })).toHaveLength(3);
  });

  it('出力の長さが合わなければ例外にする', () => {
    expect(() => nonMaxSuppression(new Float32Array(16), 11)).toThrow('倍数');
  });
});

describe('decodeDetections', () => {
  it('縦長の動画（1080x1920）ではレターボックスを戻して縦長の表示座標にする', () => {
    const lb = computeLetterbox(1080, 1920, 640); // 360x640 → 横を 384 まで埋める（左に 12）
    const out = makeOutput(1, [{ cx: 192, cy: 320, w: 10, h: 10, scores: { 0: 0.5 } }]);
    const [d] = decodeDetections(out, 1, lb);
    expectClose([...d.box], [525, 945, 555, 975], 1e-6);
  });
});

/** end2end の出力 [300][6]（x1, y1, x2, y2, score, cls）。足りない行は 0 で埋める */
function end2endOutput(rows: readonly (readonly number[])[]): Float32Array {
  const out = new Float32Array(300 * 6);
  rows.forEach((r, i) => out.set(r, i * 6));
  return out;
}

describe('decodeEnd2End', () => {
  const lb = computeLetterbox(1920, 1080, 1280); // 1280x720 → 縦を 736 まで埋める（上に 8）

  it('信頼度が閾値より大きい行だけを、NMS をかけずに表示座標へ戻す', () => {
    const out = end2endOutput([
      [100, 108, 110, 118, 0.9, 0],
      [100, 108, 111, 118, 0.8, 0], // 重なっていても end2end なので消さない
      [0, 8, 10, 18, 0.15, 1], // 閾値ちょうどは採らない
      [0, 8, 5, 13, 0.1, 2],
    ]);
    const got = decodeEnd2End(out, lb);
    expect(got.map((d) => d.cls)).toEqual([0, 0]);
    expectClose([...got[0].box], [150, 150, 165, 165], 1e-4);
  });

  it('行の長さが 6 の倍数でなければ例外にする', () => {
    expect(() => decodeEnd2End(new Float32Array(7), lb)).toThrow('6 の倍数');
  });
});

describe('decodeOutput', () => {
  it('manifest の出力形式で解読のしかたを切り替える', () => {
    const lb = computeLetterbox(640, 640, 640);
    const end2end = end2endOutput([[10, 10, 20, 20, 0.5, 3]]);
    expect(decodeOutput(end2end, 'yolo26-end2end', 11, lb).map((d) => d.cls)).toEqual([3]);
    const raw = makeOutput(2, [{ cx: 15, cy: 15, w: 10, h: 10, scores: { 1: 0.5 } }]);
    expect(decodeOutput(raw, 'yolov8-raw', 2, lb).map((d) => d.cls)).toEqual([1]);
  });
});
