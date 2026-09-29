import { describe, expect, it } from 'vitest';

import { enhanceRgba, gammaLut } from './enhance';
import { loadCapFixture } from './fixtures';

interface EnhanceFixture {
  readonly lut: number[];
  readonly width: number;
  readonly height: number;
  readonly cases: { readonly name: string; readonly prev: number[]; readonly cur: number[]; readonly next: number[]; readonly expected: number[] }[];
}

const fx = loadCapFixture<EnhanceFixture>('enhance');

/** Python の H x W x 3（BGR）を RGBA に詰める。演算はチャンネルごとなので、並びの違いは結果に影響しない */
function toRgba(values: readonly number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray((values.length / 3) * 4);
  for (let i = 0; i < values.length / 3; i++) {
    out.set([values[i * 3], values[i * 3 + 1], values[i * 3 + 2], 255], i * 4);
  }
  return out;
}

const toRgb = (rgba: Uint8ClampedArray) => Array.from(rgba).filter((_, i) => i % 4 !== 3);

describe('Python 版（tennis.py）との一致', () => {
  it('ガンマの変換表', () => {
    expect(Array.from(gammaLut())).toEqual(fx.lut);
  });

  it.each(fx.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const full = { x: 0, y: 0, width: fx.width, height: fx.height };
    const out = enhanceRgba(toRgba(c.prev), toRgba(c.cur), toRgba(c.next), fx.width, fx.height, full);
    expect(toRgb(out)).toEqual(c.expected);
  });
});

describe('enhanceRgba', () => {
  it('rect の外（レターボックスの余白）は元のまま、アルファは 255 のまま', () => {
    const size = 4 * 4 * 4;
    const cur = new Uint8ClampedArray(size).fill(114);
    const moved = new Uint8ClampedArray(size).fill(200);
    const out = enhanceRgba(moved, cur, moved, 4, 4, { x: 1, y: 1, width: 2, height: 2 });
    expect(Array.from(out.slice(0, 4))).toEqual([114, 114, 114, 114]); // (0,0) は余白
    expect(out[(1 * 4 + 1) * 4]).not.toBe(114); // (1,1) は強調される
    expect(out[(1 * 4 + 1) * 4 + 3]).toBe(114); // アルファは cur のまま
  });

  it('画素数が合わなければ例外にする', () => {
    const a = new Uint8ClampedArray(16);
    expect(() => enhanceRgba(a, a, new Uint8ClampedArray(12), 2, 2, { x: 0, y: 0, width: 2, height: 2 })).toThrow('画素数');
  });
});
