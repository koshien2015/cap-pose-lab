import { describe, expect, it } from 'vitest';

import { fitLayout } from './drawPose';

describe('fitLayout', () => {
  it('縦長の映像は高さの上限に合わせ、左右中央に同じ倍率で置く（画像と骨格がずれない）', () => {
    const l = fitLayout({ minX: 0, minY: 0, width: 1080, height: 1920 }, 360, 480);
    expect(l.height).toBe(480);
    expect(l.scale).toBeCloseTo(0.25);
    expect(l.offsetX).toBeCloseTo((360 - 1080 * 0.25) / 2);
    expect(l.offsetY).toBeCloseTo(0);
    expect(l.toCanvas(1080, 1920)).toEqual([l.offsetX + 270, 480]);
  });

  it('横長の映像は幅いっぱいに置く', () => {
    const l = fitLayout({ minX: 0, minY: 0, width: 1920, height: 1080 }, 320, 480);
    expect(l.height).toBeCloseTo(180);
    expect(l.offsetX).toBeCloseTo(0);
  });
});
