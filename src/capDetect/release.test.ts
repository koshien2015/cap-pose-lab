import { describe, expect, it } from 'vitest';

import type { FrameRecord, PitcherState } from './records';
import { findReleaseCandidate } from './release';

const rec = (frame: number, pitcher: PitcherState): FrameRecord => ({ frame, cap: null, pitcher });

describe('findReleaseCandidate', () => {
  it('直前に推論したコマが motion で、このコマが release なら、このコマを候補にする', () => {
    expect(findReleaseCandidate([rec(0, 'motion'), rec(5, 'motion'), rec(10, 'release'), rec(15, null)])).toBe(10);
  });

  it('あいだに投手なしのコマがあれば切り替わりとみなさない（Python 版と同じ）', () => {
    expect(findReleaseCandidate([rec(0, 'motion'), rec(5, null), rec(10, 'release')])).toBeNull();
  });

  it('切り替わりが複数あれば最初のものを採る', () => {
    expect(findReleaseCandidate([rec(0, 'motion'), rec(1, 'release'), rec(2, 'motion'), rec(3, 'release')])).toBe(1);
  });

  it('遡って推論した記録が後ろに積まれていても、frame 順で判定する', () => {
    // 10 でキャップを見つけ、6〜9 を遡って推論した順に積まれている
    const records = [rec(0, 'motion'), rec(5, 'motion'), rec(10, 'release'), rec(6, 'motion'), rec(7, 'motion'), rec(8, 'motion'), rec(9, 'release')];
    expect(findReleaseCandidate(records)).toBe(9);
  });

  it('切り替わりが無ければ null', () => {
    expect(findReleaseCandidate([rec(0, 'release'), rec(5, 'release')])).toBeNull();
    expect(findReleaseCandidate([])).toBeNull();
  });
});
