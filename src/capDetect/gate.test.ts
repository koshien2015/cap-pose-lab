import { describe, expect, it } from 'vitest';

import { DEFAULT_GATE, expectedInferences, INITIAL_GATE, noteDetection, shouldInfer } from './gate';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('gate', () => {
  it('見つかるまでは5コマに1回だけ推論する', () => {
    expect(range(12).filter((f) => shouldInfer(INITIAL_GATE, f))).toEqual([0, 5, 10]);
  });

  it('見つけたら、そのコマ + 30 まで連続で推論する', () => {
    const state = noteDetection(INITIAL_GATE, 20, true);
    expect(shouldInfer(state, 21)).toBe(true);
    expect(shouldInfer(state, 50)).toBe(true);
    expect(shouldInfer(state, 51)).toBe(false);
    expect(shouldInfer(state, 55)).toBe(true); // 間引きに戻る
  });

  it('連続の途中でまた見つければ延びる。見つからなければ変わらない', () => {
    const found = noteDetection(noteDetection(INITIAL_GATE, 20, true), 40, true);
    expect(found.denseUntil).toBe(70);
    expect(noteDetection(found, 41, false)).toBe(found);
  });

  it('searchStride が1なら全コマ推論する', () => {
    const every = { ...DEFAULT_GATE, searchStride: 1 };
    expect(range(4).every((f) => shouldInfer(INITIAL_GATE, f, every))).toBe(true);
  });

  it('searchStride が1未満なら例外にする', () => {
    expect(() => shouldInfer(INITIAL_GATE, 0, { ...DEFAULT_GATE, searchStride: 0 })).toThrow('searchStride');
  });

  it('見積もり用の推論回数: 間引きの分 + 連続の分 + 遡りの分（コマ数を超えない）', () => {
    expect(expectedInferences(600)).toBe(120 + 30 + 4);
    expect(expectedInferences(20)).toBe(20);
  });
});
