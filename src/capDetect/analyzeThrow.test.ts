import { describe, expect, it } from 'vitest';

import { analyzeThrow } from './analyzeThrow';
import { SYNTH_FPS, SYNTH_HEIGHT, SYNTH_RELEASE, syntheticThrow } from './syntheticThrow';

const base = { fps: SYNTH_FPS, frameHeight: SYNTH_HEIGHT, releaseFrame: SYNTH_RELEASE };
const SPEED = (9.22 / (23 / 60)) * 3.6; // 101〜124 コマ（t = 1/60 〜 24/60）

describe('analyzeThrow', () => {
  it('きれいな投球: リリースを原点に軌跡と球速を出す', () => {
    const a = analyzeThrow({ ...base, records: syntheticThrow() });
    expect(a.problem).toBeNull();
    expect(a.originFrame).toBe(SYNTH_RELEASE);
    expect(a.speedKmh).toBeCloseTo(SPEED, 6);
    expect(a.speedSuspicious).toBe(false);
    expect(a.trajectory.map((p) => p.frame)).toEqual(Array.from({ length: 24 }, (_, i) => 101 + i));
  });

  it('見失ったコマは補い、誤検出は除く', () => {
    const a = analyzeThrow({ ...base, records: syntheticThrow({ missing: [105, 106], outliers: [110, 118] }) });
    expect(a.trajectory.filter((p) => p.interpolated).map((p) => p.frame)).toEqual([105, 106, 110, 118]);
    expect(a.fit?.outliers.map((p) => p.frame)).toEqual([110, 118]);
  });

  it('リリースより前の手の中のキャップは使わない', () => {
    const a = analyzeThrow({ ...base, records: syntheticThrow({ capInHand: [90, 92, 94, 96, 98] }) });
    const used = [...(a.fit?.inliers ?? []), ...(a.fit?.outliers ?? [])].map((p) => p.frame);
    expect(used.some((f) => f < SYNTH_RELEASE)).toBe(false);
    expect(a.detections.filter((d) => d.frame < SYNTH_RELEASE)).toHaveLength(5); // 表示用には残る
    expect(a.speedKmh).toBeCloseTo(SPEED, 6);
  });

  it('リリースが分からなければ最初の検出を原点にする（球速は変わらない）', () => {
    const a = analyzeThrow({ ...base, releaseFrame: null, records: syntheticThrow() });
    expect(a.originFrame).toBe(101);
    expect(a.speedKmh).toBeCloseTo(SPEED, 6);
  });

  it('リリースを最後の検出より後にすると、落ちずに「リリースより後が足りない」を返す', () => {
    const a = analyzeThrow({ ...base, releaseFrame: 150, records: syntheticThrow() });
    expect(a.problem).toBe('too_few_after_release');
    expect(a.fit).toBeNull();
    expect(a.speedKmh).toBeNull();
  });

  it('キャップが1つも見つからなければ「見つけられない」', () => {
    const a = analyzeThrow({ ...base, releaseFrame: null, records: syntheticThrow({ flightFrames: 0 }) });
    expect(a.problem).toBe('too_few');
    expect(a.originFrame).toBeNull();
  });

  it('球速が 30〜150 km/h を外れたら注記の印を付ける', () => {
    const a = analyzeThrow({ ...base, records: syntheticThrow({ flightFrames: 6 }) }); // 約 400 km/h
    expect(a.problem).toBeNull();
    expect(a.speedSuspicious).toBe(true);
  });

  it('外れ値の閾値は画面の高さで決まる（縦長の動画では高さが大きい）', () => {
    const jitter = (f: number) => [0, f % 2 === 0 ? 10 : -10] as const;
    const records = syntheticThrow({ jitter });
    expect(analyzeThrow({ ...base, frameHeight: 1920, records }).fit?.outliers).toEqual([]); // 閾値 28.8px
    // 閾値 7.2px: 偶数コマと奇数コマが別々の放物線に見え、片方が外れ値になる
    expect(analyzeThrow({ ...base, frameHeight: 480, records }).fit?.outliers.length).toBeGreaterThan(0);
  });

  it('記録の並びが frame 順でなくても同じ結果になる', () => {
    const records = syntheticThrow({ missing: [107] });
    const shuffled = [...records.slice(120), ...records.slice(0, 120)];
    expect(analyzeThrow({ ...base, records: shuffled })).toEqual(analyzeThrow({ ...base, records }));
  });

  it('fps や画面の高さが正でなければ例外にする', () => {
    expect(() => analyzeThrow({ ...base, fps: 0, records: [] })).toThrow('fps');
  });
});
