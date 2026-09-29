import { describe, expect, it } from 'vitest';

import { analyzeSwing } from './analyzeSwing';
import { swingFrames, swingOrigin } from './swingFrames';
import { swingSeries } from './swingSeries';
import { NEED_IMPACT, openLagMs, strideLabel, swingSummary } from './swingSummary';
import { type SwingSpec, syntheticSwing } from './syntheticSwing';

const summaryOf = (spec: SwingSpec, top: number | null, impact: number | null) => {
  const a = analyzeSwing(syntheticSwing(spec), {
    swingId: 's', label: '', bats: spec.bats, fps: 60, topFrame: top, impactFrame: impact,
  });
  const frames = swingFrames(a, swingOrigin(a), a.torsoPx!);
  const series = swingSeries(frames, spec.bats);
  const items = swingSummary(frames, series, 60, spec.bats, { top, impact });
  return Object.fromEntries(items.map((i) => [i.key, i]));
};

describe('開きの時間差', () => {
  it('腰が6コマ（100ms）先に回れば +100 ms・腰が先', () => {
    const s = summaryOf({ bats: 'right', hipTurnFrame: 28, shoulderTurnFrame: 34 }, null, null);
    expect(Math.abs(s.open_lag_ms.value! - 100)).toBeLessThanOrEqual(17);
    expect(s.open_lag_ms.text).toBe('腰が先');
  });

  it('肩が先なら負の値・肩が先', () => {
    const s = summaryOf({ bats: 'right', hipTurnFrame: 34, shoulderTurnFrame: 28 }, null, null);
    expect(s.open_lag_ms.value!).toBeLessThan(0);
    expect(s.open_lag_ms.text).toBe('肩が先');
  });

  it('探す範囲に値が3コマ未満なら出さない', () => {
    const nan = Number.NaN;
    expect(openLagMs([nan, nan, 1, 2, nan], [0, 1, 2, 3, 4], [0, 0.1, 0.2, 0.3, 0.4], 10, 0, 4)).toBeNull();
    expect(openLagMs([0, 1, 3, 4, 4], [0, 2, 3, 3, 3], [0, 0.1, 0.2, 0.3, 0.4], 10, 0, 4)).toBe(100);
  });
});

describe('頭の最大移動・踏み込みの向き', () => {
  it('インパクトが無ければ理由を出す（開きの時間差は全体から出す）', () => {
    const s = summaryOf({ bats: 'right' }, null, null);
    expect(s.head_max_move.value).toBeNull();
    expect(s.head_max_move.reason).toBe(NEED_IMPACT);
    expect(s.stride_dir.value).toBeNull();
    expect(s.stride_dir.reason).toBe(NEED_IMPACT);
    expect(s.open_lag_ms.value).not.toBeNull();
  });

  it('頭は構えからインパクトまでで一番離れた距離', () => {
    const s = summaryOf({ bats: 'right', headDx: (f) => 0.1 * Math.min(1, f / 45) }, null, 45);
    expect(s.head_max_move.value!).toBeCloseTo(0.1, 1);
  });

  it('前足がホームベース側へ出れば閉じ、外側なら開き、小さければほぼまっすぐ', () => {
    const step = (d: number) => (f: number) => d * Math.min(1, f / 24);
    expect(summaryOf({ bats: 'right', leadAnkleDx: step(0.15) }, null, 40).stride_dir.text).toBe('閉じ（踏み込み）');
    expect(summaryOf({ bats: 'right', leadAnkleDx: step(-0.15) }, null, 40).stride_dir.text).toBe('開き（アウトステップ）');
    expect(summaryOf({ bats: 'right', leadAnkleDx: step(0.05) }, null, 40).stride_dir.text).toBe('ほぼまっすぐ');
    expect(summaryOf({ bats: 'left', leadAnkleDx: step(0.15) }, null, 40).stride_dir.text).toBe('閉じ（踏み込み）');
  });

  it('区分の境目（±0.1 ちょうどはほぼまっすぐ）', () => {
    expect(strideLabel(0.1)).toBe('ほぼまっすぐ');
    expect(strideLabel(0.1001)).toBe('閉じ（踏み込み）');
    expect(strideLabel(-0.1)).toBe('ほぼまっすぐ');
    expect(strideLabel(-0.1001)).toBe('開き（アウトステップ）');
  });

  it('インパクトが先頭のコマでも NaN にしない', () => {
    const s = summaryOf({ bats: 'right' }, null, 0);
    expect(s.head_max_move.value).toBe(0);
    expect(s.stride_dir.value).toBe(0);
    expect(s.stride_dir.text).toBe('ほぼまっすぐ');
  });

  it('前足首が写っていなければ理由を出す', () => {
    const all = Array.from({ length: 60 }, (_, i) => i);
    const s = summaryOf({ bats: 'right', missing: [{ name: 'left_ankle', frames: all }] }, null, 40);
    expect(s.stride_dir.value).toBeNull();
    expect(s.stride_dir.reason).toBe('前足首が写っていません');
  });
});
