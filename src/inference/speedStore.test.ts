import { beforeEach, describe, expect, it } from 'vitest';

import { loadMeasuredSpeed, saveMeasuredSpeed } from './speedStore';

describe('speedStore', () => {
  beforeEach(() => localStorage.clear());

  it('保存した実測値を読み出せる', () => {
    saveMeasuredSpeed('fast', 'webgpu', 31.5);
    expect(loadMeasuredSpeed('fast', 'webgpu')).toBe(31.5);
    expect(loadMeasuredSpeed('fast', 'wasm')).toBeUndefined();
  });

  it('ストレージが使えなくても例外にしない', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(() => saveMeasuredSpeed('fast', 'webgpu', 10, broken)).not.toThrow();
    expect(loadMeasuredSpeed('fast', 'webgpu', broken)).toBeUndefined();
  });

  it('壊れた値は無視する', () => {
    localStorage.setItem('capPoseLab.speed.fast.webgpu', 'abc');
    expect(loadMeasuredSpeed('fast', 'webgpu')).toBeUndefined();
  });
});
