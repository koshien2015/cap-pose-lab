import { describe, expect, it } from 'vitest';

import { estimateRemainingMs, formatDuration } from './eta';

describe('estimateRemainingMs', () => {
  it('平均ペースで残りを見積もる', () => {
    expect(estimateRemainingMs(1000, 10, 30)).toBe(2000);
  });

  it('まだ1件も終わっていなければ null', () => {
    expect(estimateRemainingMs(500, 0, 30)).toBeNull();
  });

  it('全部終わっていれば 0', () => {
    expect(estimateRemainingMs(1000, 30, 30)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('秒・分で表示する', () => {
    expect(formatDuration(4_400)).toBe('約 4 秒');
    expect(formatDuration(120_000)).toBe('約 2 分');
    expect(formatDuration(95_000)).toBe('約 1 分 35 秒');
    expect(formatDuration(null)).toBe('計算中');
  });
});
