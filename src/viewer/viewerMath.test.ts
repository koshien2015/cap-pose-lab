import { describe, expect, it } from 'vitest';

import pair from '../analysis/__fixtures__/pair.json';
import { loadFixture } from '../analysis/fixtures';
import type { ViewerPayload } from '../analysis/payload';
import {
  anchorIndex, anchorIndexFor, cursorOfFrame, jointLabel, cursorRange, defaultSync, diffText, formatMagnitude, frameAt, pitchCursor, realIndex,
  shiftLimit, targetNames, vectorAt, type ViewState,
} from './viewerMath';

const P = pair.payload as unknown as ViewerPayload;
const noEvents = loadFixture('no_events').expected.payload as unknown as ViewerPayload;
const state = (over: Partial<ViewState>): ViewState => ({ sync: 'frame', vector: 'none', target: '__arm__', ...over });

describe('viewerMath', () => {
  it('進行率でそろえられない投球があれば、既定はリリース基準', () => {
    expect(defaultSync(P)).toBe('progress');
    expect(defaultSync(noEvents)).toBe('release');
  });

  it('進行率モードのカーソルは 0〜100', () => {
    expect(cursorRange(P, state({ sync: 'progress' }))).toEqual({ min: 0, max: 100 });
  });

  it('リリース基準ではリリースが 0、前後は長いほうに合わせる', () => {
    const s = state({ sync: 'release' });
    const r = cursorRange(P, s);
    expect(r.min).toBe(-Math.max(...P.pitches.map(anchorIndex)));
    const a = P.pitches[0];
    expect(frameAt(a, 0, s)?.f).toBe(a.events.release.frame);
  });

  it('リリースが無い投球はリリース基準で先頭を 0 とする（落ちない）', () => {
    expect(anchorIndex(noEvents.pitches[0])).toBe(0);
  });

  it('速度は各投球の fps で秒あたりに直す（fps が違っても同じ動きならほぼ同じ値）', () => {
    const s = state({ sync: 'frame', vector: 'velocity' });
    const [a, b] = P.pitches; // b は a を1コマおきに間引いた 30fps
    const va = vectorAt(a, 20, 'right_wrist', s);
    const vb = vectorAt(b, 10, 'right_wrist', s);
    expect(va).not.toBeNull();
    expect(vb).not.toBeNull();
    const ma = Math.hypot(va![0], va![1]);
    const mb = Math.hypot(vb![0], vb![1]);
    expect(Math.abs(ma - mb) / ma).toBeLessThan(0.2);
  });

  it('加速度は前後が揃わないコマでは null', () => {
    expect(vectorAt(P.pitches[0], 0, 'right_wrist', state({ vector: 'accel' }))).toBeNull();
  });

  it('進行率モードの数値は、進行率が最も近い実フレームの値', () => {
    const a = P.pitches[0];
    const i = realIndex(a, 50, state({ sync: 'progress' }))!;
    expect(Math.abs(a.frames[i].p! - 50)).toBeLessThan(5);
  });

  it('イベントの目盛り位置（進行率モードはリリースが右端）', () => {
    const a = P.pitches[0];
    expect(cursorOfFrame(a, a.events.release.frame!, state({ sync: 'progress' }), 101)).toBe(100);
  });

  it('関節名は日本語で表示する（内部名を画面に出さない）', () => {
    expect(jointLabel('left_shoulder')).toBe('左肩');
    expect(jointLabel('right_wrist')).toBe('右手首');
    expect(jointLabel('nose')).toBe('鼻');
    expect(jointLabel('unknown_point')).toBe('unknown_point');
  });

  it('表示用の数値', () => {
    expect(formatMagnitude(0.012345)).toBe('0.0123');
    expect(formatMagnitude(null)).toBe('—');
    expect(diffText([10, 7.5])).toBe('+2.5');
    expect(diffText([1, null])).toBe('');
  });
});

describe('2本目のずらし', () => {
  const s = (shift: number, sync: ViewState['sync'] = 'frame') => state({ sync, shift });

  it('+n なら、同じ位置で2本目は n コマ前のコマを出す（1本目は動かない）', () => {
    expect(pitchCursor(10, 0, s(3))).toBe(10);
    expect(pitchCursor(10, 1, s(3))).toBe(7);
  });

  it('進行率ではずらさない', () => {
    expect(pitchCursor(10, 1, s(3, 'progress'))).toBe(10);
  });

  it('範囲は、ずらした2本目も入るよう広がる', () => {
    const [a, b] = P.pitches;
    expect(cursorRange(P, s(0))).toEqual({ min: 0, max: Math.max(a.frames.length, b.frames.length) - 1 });
    expect(cursorRange(P, s(30)).max).toBe(Math.max(a.frames.length - 1, b.frames.length - 1 + 30));
    expect(cursorRange(P, s(-5)).min).toBe(-5);
  });

  it('基準の瞬間に合わせるときも、2本目の範囲だけずれる', () => {
    const base = cursorRange(P, s(0, 'release'));
    const [a, b] = P.pitches;
    const shifted = cursorRange(P, s(4, 'release'));
    expect(shifted.min).toBe(Math.min(-anchorIndex(a), -anchorIndex(b) + 4));
    expect(shifted.max).toBe(Math.max(base.max, b.frames.length - 1 - anchorIndex(b) + 4));
  });

  it('目盛りも2本目だけずれる', () => {
    const [a, b] = P.pitches;
    const at = cursorOfFrame(b, b.events.release.frame!, s(0, 'release'), 101, 1)!;
    expect(cursorOfFrame(b, b.events.release.frame!, s(4, 'release'), 101, 1)).toBe(at + 4);
    expect(cursorOfFrame(a, a.events.release.frame!, s(4, 'release'), 101, 0)).toBe(0);
  });

  it('端までずらしても、範囲の端で落ちない', () => {
    const limit = shiftLimit(P);
    expect(limit).toBe(Math.max(...P.pitches.map((p) => p.frames.length)));
    for (const shift of [limit, -limit]) {
      const st = s(shift, 'release');
      const r = cursorRange(P, st);
      for (const c of [r.min, r.max]) {
        P.pitches.forEach((p, i) => expect(() => frameAt(p, pitchCursor(c, i, st), st)).not.toThrow());
      }
    }
  });
});

describe('比較用データでの上書き（打者）', () => {
  it('anchorEvent の瞬間を 0 にする', () => {
    const a = P.pitches[0];
    const withImpact = { ...a, events: { ...a.events, impact: { frame: a.frames[5].f, source: 'manual' } } };
    expect(anchorIndexFor(withImpact, 'impact')).toBe(5);
    expect(frameAt(withImpact, 0, state({ sync: 'release', anchorEvent: 'impact' }))?.f).toBe(a.frames[5].f);
  });

  it('arm_joints があれば「投げる腕」はその関節、無ければ投球腕', () => {
    const a = P.pitches[0];
    expect(targetNames({ ...a, arm_joints: ['hands'] }, state({ target: '__arm__' }), [])).toEqual(['hands']);
    const side = a.throwing_side;
    expect(targetNames(a, state({ target: '__arm__' }), [])).toEqual([`${side}_shoulder`, `${side}_elbow`, `${side}_wrist`]);
  });

  it('両手は日本語名で出す', () => {
    expect(jointLabel('hands')).toBe('両手');
  });
});
