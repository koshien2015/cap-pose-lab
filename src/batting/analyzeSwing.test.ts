import { describe, expect, it } from 'vitest';

import { analyzeSwing, type SwingConfig, torsoLength, validateSwingEvents } from './analyzeSwing';
import { SWING_TORSO, syntheticSwing } from './syntheticSwing';

const config = (over: Partial<SwingConfig> = {}): SwingConfig => ({
  swingId: 's', label: '', bats: 'right', fps: 60, topFrame: null, impactFrame: null, ...over,
});
const all = Array.from({ length: 60 }, (_, i) => i);

describe('validateSwingEvents', () => {
  it('インパクトがトップより後なら通す。どちらか未指定でも通す', () => {
    expect(validateSwingEvents(20, 40)).toBeNull();
    expect(validateSwingEvents(null, 40)).toBeNull();
    expect(validateSwingEvents(20, null)).toBeNull();
  });

  it('インパクトがトップより前か同じなら止める', () => {
    expect(validateSwingEvents(40, 20)).toBe('インパクトはトップより後のコマにしてください');
    expect(validateSwingEvents(20, 20)).toBe('インパクトはトップより後のコマにしてください');
  });
});

describe('analyzeSwing', () => {
  it('胴の長さ（肩の中点〜腰の中点の中央値）を大きさの基準にする', () => {
    const a = analyzeSwing(syntheticSwing({ bats: 'right' }), config());
    expect(a.torsoPx).toBeCloseTo(SWING_TORSO, 1);
  });

  it('肩がどのコマにも写っていなければ、胴の長さは null', () => {
    const json = syntheticSwing({
      bats: 'right',
      missing: [{ name: 'left_shoulder', frames: all }, { name: 'right_shoulder', frames: all }],
    });
    expect(torsoLength(analyzeSwing(json, config()).smoothed)).toBeNull();
  });

  it('進行率はトップ=0%、インパクト=100%、区間外は NaN', () => {
    const a = analyzeSwing(syntheticSwing({ bats: 'right' }), config({ topFrame: 20, impactFrame: 40 }));
    expect(a.events.top.frame).toBe(20);
    expect(a.events.impact.frame).toBe(40);
    expect(a.events.swing_start.frame).toBe(0);
    expect(a.events.swing_end.frame).toBe(59);
    expect(a.progress[20]).toBe(0);
    expect(a.progress[30]).toBeCloseTo(50, 6);
    expect(a.progress[40]).toBe(100);
    expect(a.progress[10]).toBeNaN();
    expect(a.progress[50]).toBeNaN();
  });

  it('トップが無ければ進行率は全コマ NaN（エラーにしない）', () => {
    const a = analyzeSwing(syntheticSwing({ bats: 'right' }), config({ impactFrame: 40 }));
    expect(a.progress.every(Number.isNaN)).toBe(true);
  });
});
