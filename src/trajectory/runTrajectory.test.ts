import { describe, expect, it } from 'vitest';

import { friendlyError } from '../content/errors';
import type { DetectRun } from '../inference/runDetect';
import { assertDecoded } from './runTrajectory';

const run: DetectRun = { fileName: 'clip.mp4', fps: 60, width: 1920, height: 1080, frameCount: 10, records: [], images: [], msPerInference: 40 };

describe('assertDecoded', () => {
  it('コマを読めていればそのまま返す', () => {
    expect(assertDecoded(run)).toBe(run);
  });

  it('1コマも読めなかったら、画面が止まらないよう「動画を読み込めない」エラーにする', () => {
    const empty = { ...run, width: 0, height: 0 };
    expect(() => assertDecoded(empty)).toThrow();
    try {
      assertDecoded(empty);
    } catch (e) {
      expect(friendlyError(e).title).toBe('この動画は読み込めませんでした');
    }
  });
});
