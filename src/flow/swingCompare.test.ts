import { describe, expect, it } from 'vitest';

import type { SwingConfig } from '../batting/analyzeSwing';
import { syntheticSwing } from '../batting/syntheticSwing';
import { buildSwingComparison, type SwingCompareInput } from './swingCompare';

const input = (over: Partial<SwingConfig> = {}): SwingCompareInput => ({
  json: syntheticSwing({ bats: 'right' }),
  thumbnails: null,
  thumbStride: 1,
  config: { swingId: 'a', label: '', bats: 'right', fps: 60, topFrame: null, impactFrame: null, ...over },
});

describe('buildSwingComparison', () => {
  it('2本から打者の比較用データを作る', () => {
    const result = buildSwingComparison([input(), input({ swingId: 'b', impactFrame: 40 })]);
    expect('payload' in result && result.payload.pitches).toHaveLength(2);
  });

  it('トップとインパクトの順番が逆なら、どの動画かを添えて理由を返す', () => {
    expect(buildSwingComparison([input({ topFrame: 40, impactFrame: 20 })])).toEqual({
      error: 'a: インパクトはトップより後のコマにしてください',
    });
  });

  it('作れないときは例外にせず理由を返す', () => {
    const all = Array.from({ length: 60 }, (_, i) => i);
    const broken: SwingCompareInput = {
      ...input(),
      json: syntheticSwing({ bats: 'right', missing: [{ name: 'left_hip', frames: all }, { name: 'right_hip', frames: all }] }),
    };
    const result = buildSwingComparison([broken]);
    expect('error' in result).toBe(true);
  });
});
