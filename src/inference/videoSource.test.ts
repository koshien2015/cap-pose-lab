import { describe, expect, it } from 'vitest';

import { displaySize, thumbnailSize, thumbnailStride } from './frameCanvas';
import { rotationFromMatrix } from './videoSource';

// ISO BMFF の tkhd 行列（16.16 固定小数）。[a, b, u, c, d, v, x, y, w]
const FIXED = 0x10000;
const matrixFor = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  const cos = Math.round(Math.cos(r)) * FIXED;
  const sin = Math.round(Math.sin(r)) * FIXED;
  return [cos, sin, 0, -sin, cos, 0, 0, 0, 0x40000000];
};

describe('rotationFromMatrix', () => {
  it.each([0, 90, 180, 270])('%i° を読み取る', (deg) => {
    expect(rotationFromMatrix(matrixFor(deg))).toBe(deg);
  });

  it('想定外の角度は 0 とみなす', () => {
    expect(rotationFromMatrix([46341, 46341, 0, -46341, 46341, 0, 0, 0, 0x40000000])).toBe(0);
  });
});

describe('thumbnailSize / thumbnailStride', () => {
  it('縦動画でも長辺 320px に収める（320x569 にしない）', () => {
    expect(thumbnailSize(1080, 1920)).toEqual({ width: 180, height: 320 });
    expect(thumbnailSize(1920, 1080)).toEqual({ width: 320, height: 180 });
  });

  it('縮小画像は1本あたり最大 300 枚になるよう間引く', () => {
    expect(thumbnailStride(149)).toBe(1);
    expect(thumbnailStride(300)).toBe(1);
    expect(thumbnailStride(301)).toBe(2);
    expect(thumbnailStride(1200)).toBe(4);
  });
});

describe('displaySize', () => {
  const frame = { displayWidth: 1920, displayHeight: 1080 };

  it('iPhone の縦動画（90°）は縦長として扱う', () => {
    expect(displaySize(frame, 90)).toEqual({ width: 1080, height: 1920 });
    expect(displaySize(frame, 270)).toEqual({ width: 1080, height: 1920 });
  });

  it('0° と 180° はそのまま', () => {
    expect(displaySize(frame, 0)).toEqual({ width: 1920, height: 1080 });
    expect(displaySize(frame, 180)).toEqual({ width: 1920, height: 1080 });
  });
});
