import { describe, expect, it } from 'vitest';

import { estimateSeconds } from './estimate';

describe('estimateSeconds', () => {
  it('実測があればそれを使う', () => {
    expect(estimateSeconds(100, 'standard', 'webgpu', { isMobile: false, measuredMsPerFrame: 50 })).toBe(5);
  });

  it('実測が無ければ端末の種類から見積もる（スマホは PC の3倍）', () => {
    const pc = estimateSeconds(100, 'standard', 'webgpu', { isMobile: false });
    const phone = estimateSeconds(100, 'standard', 'webgpu', { isMobile: true });
    expect(phone).toBeCloseTo(pc * 3);
  });

  it('軽いモードほど短い', () => {
    const opts = { isMobile: false };
    const [fast, standard, detailed] = (['fast', 'standard', 'detailed'] as const).map((m) =>
      estimateSeconds(149, m, 'webgpu', opts),
    );
    expect(fast).toBeLessThan(standard);
    expect(standard).toBeLessThan(detailed);
  });

  it('0 フレームなら 0 秒', () => {
    expect(estimateSeconds(0, 'fast', 'webgpu', { isMobile: false })).toBe(0);
  });

  it('不正な実測値（0 や NaN）は無視する', () => {
    const fallback = estimateSeconds(100, 'fast', 'webgpu', { isMobile: false });
    expect(estimateSeconds(100, 'fast', 'webgpu', { isMobile: false, measuredMsPerFrame: 0 })).toBe(fallback);
    expect(estimateSeconds(100, 'fast', 'webgpu', { isMobile: false, measuredMsPerFrame: Number.NaN })).toBe(fallback);
  });
});
