import { describe, expect, it } from 'vitest';

import pair from './__fixtures__/pair.json';
import { analyzePitch, type PitchConfig } from './analyzePitch';
import { expectClose, type FixtureConfig, loadFixture } from './fixtures';
import { buildViewerPayload, ViewerDataError } from './payload';
import type { PoseJsonInput } from './types';

const configOf = (c: FixtureConfig): PitchConfig => ({
  pitchId: c.pitch_id,
  label: '',
  throwingHand: c.throwing_hand,
  batterDirection: c.batter_direction,
  fps: c.fps,
  footContactFrame: c.foot_contact_frame,
  releaseFrame: c.release_frame,
});

/** 進行率の並べ直し（normalized）を比較から外す。長い欠損の扱いだけ Python 版と意図的に変えているため */
const withoutNormalized = (payload: unknown) => {
  const p = payload as { pitches: object[] };
  return { ...p, pitches: p.pitches.map((pitch) => ({ ...pitch, normalized: null })) };
};

describe('buildViewerPayload（Python 版と一致）', () => {
  it.each(['clean_right', 'left_mirror', 'no_events', 'release_only', 'fps30'])('%s', (name) => {
    const f = loadFixture(name);
    const payload = buildViewerPayload([analyzePitch(f.input, configOf(f.config))]);
    expectClose(payload, f.expected.payload);
  });

  it('noisy_gaps（長い欠損あり）は normalized 以外が一致する', () => {
    const f = loadFixture('noisy_gaps');
    const payload = buildViewerPayload([analyzePitch(f.input, configOf(f.config))]);
    expectClose(withoutNormalized(payload), withoutNormalized(f.expected.payload));
  });

  it('長い欠損をまたいで、進行率の座標を作らない（観測していない動きを描かない）', () => {
    const f = loadFixture('noisy_gaps');
    const pitch = buildViewerPayload([analyzePitch(f.input, configOf(f.config))]).pitches[0];
    const missing = pitch.frames.filter((fr) => fr.p !== null && !fr.k.left_knee).map((fr) => fr.p as number);
    expect(missing.length).toBeGreaterThan(0);
    const inside = pitch.normalized!.filter((n) => n.p > Math.min(...missing) && n.p < Math.max(...missing));
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.every((n) => n.k.left_knee === undefined)).toBe(true);
    // 欠損の無い関節はつながったまま
    expect(inside.every((n) => n.k.left_hip !== undefined)).toBe(true);
  });

  it('2投球（fps が違う）の payload も一致する', () => {
    const analyses = pair.inputs.map((input, i) =>
      analyzePitch(input as unknown as PoseJsonInput, configOf(pair.configs[i] as FixtureConfig)),
    );
    expectClose(buildViewerPayload(analyses), pair.payload);
  });

  it('足接地・リリースが無ければ normalized は null（エラーにしない）', () => {
    const f = loadFixture('no_events');
    expect(buildViewerPayload([analyzePitch(f.input, configOf(f.config))]).pitches[0].normalized).toBeNull();
  });

  it('身体サイズが決まらなければ、やさしい理由付きで ViewerDataError', () => {
    const f = loadFixture('no_shoulders');
    const run = () => buildViewerPayload([analyzePitch(f.input, configOf(f.config))]);
    expect(run).toThrow(ViewerDataError);
    expect(run).toThrow('肩');
  });

  it('3本以上は受け付けない', () => {
    const f = loadFixture('clean_right');
    const a = analyzePitch(f.input, configOf(f.config));
    expect(() => buildViewerPayload([a, a, a])).toThrow(ViewerDataError);
    expect(() => buildViewerPayload([])).toThrow(ViewerDataError);
  });
});
