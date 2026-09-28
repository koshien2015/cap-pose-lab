import { describe, expect, it } from 'vitest';

import pair from '../analysis/__fixtures__/pair.json';
import { loadFixture } from '../analysis/fixtures';
import type { ViewerPayload } from '../analysis/payload';
import {
  anchorIndex, cursorOfFrame, jointLabel, cursorRange, defaultSync, diffText, formatMagnitude, frameAt, realIndex, vectorAt,
  type ViewState,
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
