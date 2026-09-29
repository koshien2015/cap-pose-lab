import { describe, expect, it } from 'vitest';

import { FULL_GATE } from '../capDetect/gate';
import { estimateDetectSeconds, estimateSeconds } from './estimate';

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

describe('estimateDetectSeconds', () => {
  it('推論する見込みのコマ数（間引き + 連続 + 遡り）で見積もる', () => {
    const desktop = estimateDetectSeconds(600, 'webgpu', { isMobile: false });
    const mobile = estimateDetectSeconds(600, 'webgpu', { isMobile: true });
    expect(mobile).toBeCloseTo(desktop * 3, 6);
    expect(estimateDetectSeconds(600, 'webgpu', { isMobile: false, measuredMsPerInference: 100 })).toBeCloseTo((154 * 100) / 1000, 6);
  });

  it('実測値が使えない値なら基準値に戻る', () => {
    const base = estimateDetectSeconds(100, 'wasm', { isMobile: false });
    expect(estimateDetectSeconds(100, 'wasm', { isMobile: false, measuredMsPerInference: Number.NaN })).toBe(base);
  });
});

describe('estimateDetectSeconds（全コマ推論）', () => {
  it('全コマのモードでは、動画のコマ数ぶん推論する見込みで見積もる', () => {
    expect(estimateDetectSeconds(600, 'webgpu', { isMobile: false, measuredMsPerInference: 100, gate: FULL_GATE })).toBeCloseTo(60, 6);
  });
});
