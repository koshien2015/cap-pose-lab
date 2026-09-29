import { describe, expect, it } from 'vitest';

import type { Recommendation } from '../inference/recommend';
import { describeProblem, formatSpeed, trajectoryEnvMessages } from './messages';

const rec = (verdict: Recommendation['verdict'], messages: string[] = ['元の文言']): Recommendation => ({
  verdict,
  executionProvider: verdict === 'unsupported' ? null : verdict === 'ok' ? 'webgpu' : 'wasm',
  allowedModes: [],
  recommendedMode: null,
  messages,
});

describe('describeProblem', () => {
  it('見つけられないときは撮り方の見直しをすすめる', () => {
    const text = describeProblem('too_few');
    expect(text.title).toBe('キャップの軌跡を見つけられませんでした');
    expect(text.actions.some((a) => a.includes('投手の後ろから'))).toBe(true);
  });

  it('リリースより後が足りないときは、まずリリースのコマを確かめるよう伝える', () => {
    expect(describeProblem('too_few_after_release').actions[0]).toContain('リリースより後');
  });
});

describe('trajectoryEnvMessages', () => {
  it('フォーム解析の「はやい」の話をせず、軌跡の解析向けの文言にする', () => {
    expect(trajectoryEnvMessages(rec('ok'))).toEqual(['この端末は高速モードで解析できます']);
    expect(trajectoryEnvMessages(rec('limited'))[0]).toContain('時間がかかります');
    expect(trajectoryEnvMessages(rec('unsupported', ['https で開いてください']))).toEqual(['https で開いてください']);
  });
});

describe('formatSpeed', () => {
  it('整数に丸めて「約」を付ける', () => {
    expect(formatSpeed(86.6)).toBe('約 87 km/h');
  });
});
