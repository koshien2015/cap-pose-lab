import { describe, expect, it } from 'vitest';

import { ViewerDataError } from '../analysis/payload';
import { analyzeSwing } from './analyzeSwing';
import { HANDS, swingFrames, swingOrigin } from './swingFrames';
import { swingSeries } from './swingSeries';
import { type SwingSpec, syntheticSwing } from './syntheticSwing';

const all = Array.from({ length: 60 }, (_, i) => i);
const framesOf = (spec: SwingSpec) => {
  const a = analyzeSwing(syntheticSwing(spec), {
    swingId: 's', label: '', bats: spec.bats, fps: 60, topFrame: null, impactFrame: null,
  });
  return swingFrames(a, swingOrigin(a), a.torsoPx!);
};
const seriesOf = (spec: SwingSpec) => swingSeries(framesOf(spec), spec.bats);

describe('swingFrames', () => {
  it('原点は構えの腰の中点、大きさは胴の長さ、上が正', () => {
    const [first] = framesOf({ bats: 'right' });
    const hip = [(first.k.left_hip[0] + first.k.right_hip[0]) / 2, (first.k.left_hip[1] + first.k.right_hip[1]) / 2];
    expect(hip[0]).toBeCloseTo(0, 3);
    expect(hip[1]).toBeCloseTo(0, 3);
    expect(first.k.left_shoulder[1]).toBeCloseTo(1, 2);
  });

  it('両手首の中点を hands として足す', () => {
    const frames = framesOf({ bats: 'right' });
    // 右打者の手首は画素で (525+f, 475) の中点 → X=(25+f)/100、Y=(600-475)/100
    expect(frames[10].k[HANDS][0]).toBeCloseTo(0.35, 2);
    expect(frames[10].k[HANDS][1]).toBeCloseTo(1.25, 2);
  });

  it('片方の手首が欠けたコマには hands を作らない', () => {
    const frames = framesOf({ bats: 'right', missing: [{ name: 'right_wrist', frames: [10, 11, 12, 13, 14, 15] }] });
    expect(frames[12].k[HANDS]).toBeUndefined();
    expect(frames[20].k[HANDS]).toBeDefined();
  });

  it('腰がどのコマにも写っていなければ、基準点を決められない', () => {
    const a = analyzeSwing(
      syntheticSwing({ bats: 'right', missing: [{ name: 'left_hip', frames: all }, { name: 'right_hip', frames: all }] }),
      { swingId: 's', label: '', bats: 'right', fps: 60, topFrame: null, impactFrame: null },
    );
    expect(() => swingOrigin(a)).toThrow(ViewerDataError);
  });
});

describe('swingSeries', () => {
  it('開きは構えで 0 付近、投手側を向くと肩 0.8・腰 0.6', () => {
    const s = seriesOf({ bats: 'right' });
    expect(s.shoulder_open[0]).toBeCloseTo(0, 1);
    expect(s.hip_open[0]).toBeCloseTo(0, 1);
    expect(s.shoulder_open[59]).toBeCloseTo(0.8, 1);
    expect(s.hip_open[59]).toBeCloseTo(0.6, 1);
  });

  it('左打者を左右反転すると、同じ動きの右打者と同じ値になる', () => {
    const spec = { headDx: (f: number) => 0.002 * f, leadAnkleDx: (f: number) => 0.005 * Math.min(f, 24) };
    const right = seriesOf({ bats: 'right', ...spec });
    const left = seriesOf({ bats: 'left', ...spec });
    (Object.keys(right) as (keyof typeof right)[]).forEach((key) =>
      right[key].forEach((v, i) => expect(left[key][i]).toBeCloseTo(v, 3)),
    );
  });

  it('頭は構えからの移動（両耳の中点）', () => {
    const s = seriesOf({ bats: 'right', headDx: (f) => 0.002 * f });
    expect(s.head_x[0]).toBeCloseTo(0, 3);
    expect(s.head_x[40]).toBeCloseTo(0.08, 2);
    expect(s.head_y[40]).toBeCloseTo(0, 3);
  });

  it('片耳が欠けたコマは頭の値を空ける', () => {
    const s = seriesOf({ bats: 'right', missing: [{ name: 'left_ear', frames: [10, 11, 12, 13, 14, 15] }] });
    expect(s.head_x[12]).toBeNaN();
    expect(s.head_x[20]).not.toBeNaN();
  });

  it('手は両手首の中点の位置', () => {
    const s = seriesOf({ bats: 'right' });
    expect(s.hands_x[10]).toBeCloseTo(0.35, 2);
    expect(s.hands_y[10]).toBeCloseTo(1.25, 2);
  });
});
