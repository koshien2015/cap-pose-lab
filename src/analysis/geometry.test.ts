import { describe, expect, it } from 'vitest';

import { directionAngle, distance, facingSign, gradient, jointAngle, midpoint } from './geometry';

describe('geometry', () => {
  it('jointAngle: 直線は 180°、直角は 90°、欠損やゼロ長は null', () => {
    expect(jointAngle([0, 0], [1, 0], [2, 0])).toBeCloseTo(180);
    expect(jointAngle([0, 1], [0, 0], [1, 0])).toBeCloseTo(90);
    expect(jointAngle(null, [0, 0], [1, 0])).toBeNull();
    expect(jointAngle([0, 0], [0, 0], [1, 0])).toBeNull();
  });

  it('directionAngle: 画像の Y 下向きを反転し、打者方向を正にする', () => {
    expect(directionAngle([0, 0], [0, -1], 1)).toBeCloseTo(90);
    expect(directionAngle([0, 0], [1, 0], 1)).toBeCloseTo(0);
    // 真後ろは ±180（Python と同じく -0 の扱いで -180 になる）
    expect(Math.abs(directionAngle([0, 0], [1, 0], -1) ?? 0)).toBeCloseTo(180);
    expect(directionAngle([0, 0], [0, 0], 1)).toBeNull();
  });

  it('facingSign / distance / midpoint', () => {
    expect(facingSign('right')).toBe(1);
    expect(facingSign('left')).toBe(-1);
    expect(distance([0, 0], [3, 4])).toBe(5);
    expect(distance(null, [3, 4])).toBeNull();
    expect(midpoint([0, 0], [2, 4])).toEqual([1, 2]);
    expect(midpoint(null, [2, 4])).toBeNull();
  });

  it('gradient: np.gradient と同じ（中央差分・端は片側・NaN 伝播）', () => {
    expect(gradient([0, 1, 4, 9], 1)).toEqual([1, 2, 4, 5]);
    expect(gradient([0, 2], 2)).toEqual([4, 4]);
    const g = gradient([0, Number.NaN, 4, 9], 1);
    expect(Number.isNaN(g[0])).toBe(true);
    expect(g[3]).toBe(5);
    expect(gradient([1], 60).every(Number.isNaN)).toBe(true);
  });
});
