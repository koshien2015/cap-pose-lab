import { describe, expect, it } from 'vitest';

import { expectClose } from '../analysis/fixtures';
import { ViewerDataError } from '../analysis/payload';
import { analyzeSwing, type Bats, type SwingConfig } from './analyzeSwing';
import { buildSwingPayload } from './swingPayload';
import { type SwingSpec, syntheticSwing } from './syntheticSwing';

const analysisOf = (spec: SwingSpec, over: Partial<SwingConfig> = {}) =>
  analyzeSwing(syntheticSwing(spec), { swingId: `swing_${spec.bats}`, label: '', bats: spec.bats, fps: 60, topFrame: null, impactFrame: null, ...over });

describe('buildSwingPayload', () => {
  it('打者の比較用データ（基準はインパクト、グラフ6項目、両手、まとめ3つ）', () => {
    const payload = buildSwingPayload([analysisOf({ bats: 'right' }, { impactFrame: 40 })]);
    expect(payload.subject).toBe('batter');
    expect(payload.anchor_event).toBe('impact');
    expect(payload.anchor_label).toBe('インパクト');
    expect(Object.values(payload.panel_series)).toEqual(['肩の開き', '腰の開き', '頭の左右', '頭の上下', '手の左右', '手の高さ']);
    const pitch = payload.pitches[0];
    expect(pitch.scale_mode).toBe('torso_length');
    expect(pitch.arm_joints).toEqual(['hands']);
    expect(pitch.trail_joints).toEqual(['hands']);
    expect(pitch.frames[0].k.hands).toBeDefined();
    expect(pitch.events.impact.frame).toBe(40);
    expect(pitch.summary!.map((s) => s.key)).toEqual(['open_lag_ms', 'head_max_move', 'stride_dir']);
  });

  it('系列は JSON にできる値（NaN は null）', () => {
    const payload = buildSwingPayload([
      analysisOf({ bats: 'right', missing: [{ name: 'left_ear', frames: [10, 11, 12, 13, 14, 15] }] }),
    ]);
    Object.values(payload.pitches[0].series).forEach((values) =>
      values.forEach((v) => expect(v === null || Number.isFinite(v)).toBe(true)),
    );
    expect(payload.pitches[0].series.head_x[12]).toBeNull();
  });

  it('トップも指定したときだけ進行率で並べ直せる', () => {
    expect(buildSwingPayload([analysisOf({ bats: 'right' }, { impactFrame: 40 })]).pitches[0].normalized).toBeNull();
    expect(buildSwingPayload([analysisOf({ bats: 'right' }, { topFrame: 20, impactFrame: 40 })]).pitches[0].normalized).not.toBeNull();
  });

  it('右打者と左打者を並べると、同じ動きなら同じ系列・同じ座標になる', () => {
    const spec = (bats: Bats): SwingSpec => ({ bats, headDx: (f) => 0.002 * f });
    const payload = buildSwingPayload([analysisOf(spec('right'), { impactFrame: 40 }), analysisOf(spec('left'), { impactFrame: 40 })]);
    const [right, left] = payload.pitches;
    expectClose(left.series, right.series, 1e-3);
    expectClose(left.frames[30].k.hands, right.frames[30].k.hands, 1e-3);
  });

  it('胴が写っていなければ、やさしい理由で止める', () => {
    const all = Array.from({ length: 60 }, (_, i) => i);
    const a = analysisOf({ bats: 'right', missing: [{ name: 'left_shoulder', frames: all }, { name: 'right_shoulder', frames: all }] });
    expect(() => buildSwingPayload([a])).toThrow(ViewerDataError);
    expect(() => buildSwingPayload([a])).toThrow(/打者の上半身と腰/);
  });

  it('0本・3本以上は止める', () => {
    expect(() => buildSwingPayload([])).toThrow(ViewerDataError);
    const a = analysisOf({ bats: 'right' });
    expect(() => buildSwingPayload([a, a, a])).toThrow('比べられるのは2本までです');
  });
});
