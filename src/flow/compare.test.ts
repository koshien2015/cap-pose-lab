import { describe, expect, it } from 'vitest';

import type { PitchConfig } from '../analysis/analyzePitch';
import { loadFixture } from '../analysis/fixtures';
import { buildComparison, type CompareInput, parsePoseFile, validateEvents } from './compare';

const input = (name: string, over: Partial<PitchConfig> = {}): CompareInput => {
  const f = loadFixture(name);
  return {
    json: f.input,
    thumbnails: null,
    thumbStride: 1,
    config: {
      pitchId: f.config.pitch_id,
      label: '',
      throwingHand: f.config.throwing_hand,
      batterDirection: f.config.batter_direction,
      fps: f.config.fps,
      footContactFrame: f.config.foot_contact_frame,
      releaseFrame: f.config.release_frame,
      ...over,
    },
  };
};

describe('validateEvents', () => {
  it('リリースが足接地より前（または同じ）なら止める', () => {
    expect(validateEvents(130, 112)).toContain('リリース');
    expect(validateEvents(112, 112)).toContain('リリース');
  });
  it('どちらか未指定・正しい順番なら通す', () => {
    expect(validateEvents(null, 130)).toBeNull();
    expect(validateEvents(112, null)).toBeNull();
    expect(validateEvents(112, 130)).toBeNull();
  });
});

describe('parsePoseFile', () => {
  it('保存した pose.json を読める', () => {
    const f = loadFixture('clean_right');
    expect(parsePoseFile(JSON.stringify(f.input)).frames.length).toBe(f.input.frames.length);
  });
  it('印の無い古いファイルは、投手・打者どちらでも読める', () => {
    const text = JSON.stringify(loadFixture('clean_right').input);
    expect(() => parsePoseFile(text, 'pitcher')).not.toThrow();
    expect(() => parsePoseFile(text, 'batter')).not.toThrow();
  });

  it('投手と打者を取り違えたファイルは読み込まない', () => {
    const input = loadFixture('clean_right').input;
    const pitcher = JSON.stringify({ ...input, meta: { ...input.meta, subject: 'pitcher' } });
    const batter = JSON.stringify({ ...input, meta: { ...input.meta, subject: 'batter' } });
    expect(() => parsePoseFile(pitcher, 'batter')).toThrow('投手の解析結果です');
    expect(() => parsePoseFile(batter, 'pitcher')).toThrow('打者の解析結果です');
    expect(parsePoseFile(batter, 'batter').meta.subject).toBe('batter');
    expect(() => parsePoseFile(batter)).not.toThrow();
  });

  it('形式が違うファイルは、やさしい文言で断る', () => {
    expect(() => parsePoseFile('{"hello":1}')).toThrow('解析結果のファイルではありません');
    expect(() => parsePoseFile('not json')).toThrow('解析結果のファイルではありません');
  });
});

describe('buildComparison', () => {
  it('2本からビューア用データを作る', () => {
    const r = buildComparison([input('clean_right'), input('fps30')]);
    expect('payload' in r && r.payload.pitches.length).toBe(2);
  });
  it('イベント未指定でも作れる（進行率は使えない）', () => {
    const r = buildComparison([input('clean_right', { footContactFrame: null, releaseFrame: null })]);
    expect('payload' in r && r.payload.pitches[0].normalized).toBeNull();
  });
  it('作れないときはやさしい理由を返す（例外にしない）', () => {
    const r = buildComparison([input('no_shoulders')]);
    expect('error' in r && r.error).toContain('肩');
  });
  it('イベントの順番が逆なら理由を返す', () => {
    const r = buildComparison([input('clean_right', { footContactFrame: 130, releaseFrame: 112 })]);
    expect('error' in r && r.error).toContain('リリース');
  });
});
