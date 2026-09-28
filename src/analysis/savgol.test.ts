import { describe, expect, it } from 'vitest';

import savgolCases from './__fixtures__/savgol.json';
import { expectClose } from './fixtures';
import { savgolFilter } from './savgol';

describe('savgolFilter', () => {
  it.each(savgolCases.map((c, i) => [i, c] as const))('scipy と一致する（ケース %i）', (_i, c) => {
    expectClose(savgolFilter(c.values, c.window, c.polyorder), c.expected, 1e-9);
  });

  it('窓より短い系列は受け付けない（呼び出し側で窓を調整する前提）', () => {
    expect(() => savgolFilter([1, 2, 3], 5, 2)).toThrow();
  });
});
