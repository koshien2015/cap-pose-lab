import { describe, expect, it } from 'vitest';

import { computeLetterbox, rgbaToChw, toSourceX, toSourceY } from './letterbox';

describe('computeLetterbox', () => {
  it('1920x1080 を 960 にすると 960x544（上下 2px パディング）', () => {
    expect(computeLetterbox(1920, 1080, 960)).toEqual({
      scale: 0.5, newWidth: 960, newHeight: 540, padLeft: 0, padTop: 2, inputWidth: 960, inputHeight: 544,
    });
  });

  it('縦動画 1080x1920 を 960 にすると 544x960', () => {
    const lb = computeLetterbox(1080, 1920, 960);
    expect([lb.inputWidth, lb.inputHeight]).toEqual([544, 960]);
    expect(lb.padLeft).toBe(2);
  });

  it('不正な入力は例外にする', () => {
    expect(() => computeLetterbox(0, 1080, 960)).toThrow();
    expect(() => computeLetterbox(1920, 1080, 0)).toThrow();
  });

  it('入力座標を元フレーム座標に戻せる', () => {
    const lb = computeLetterbox(1920, 1080, 960);
    expect(toSourceX(480, lb)).toBe(960);
    expect(toSourceY(272, lb)).toBe(540);
  });
});

describe('rgbaToChw', () => {
  it('RGBA を R/G/B の面に分けて 0-1 にする', () => {
    const chw = Array.from(rgbaToChw(new Uint8ClampedArray([255, 0, 51, 255, 0, 255, 102, 255]), 2, 1));
    [1, 0, 0, 1, 0.2, 0.4].forEach((v, i) => expect(chw[i]).toBeCloseTo(v, 6));
  });

  it('画素数が合わなければ例外にする', () => {
    expect(() => rgbaToChw(new Uint8ClampedArray(4), 2, 1)).toThrow();
  });
});
