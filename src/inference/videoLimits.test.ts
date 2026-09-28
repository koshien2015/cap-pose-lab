import { describe, expect, it } from 'vitest';

import type { VideoInfo } from './videoSource';
import { checkVideoLimits } from './videoLimits';

const info: VideoInfo = {
  codec: 'avc1.640029', codedWidth: 1920, codedHeight: 1080, rotation: 0,
  fps: 60, frameCount: 300, durationSec: 5, fileSizeMB: 20,
};

describe('checkVideoLimits', () => {
  it('数秒の動画は通す', () => {
    expect(checkVideoLimits(info)).toEqual({ ok: true });
  });

  it('長すぎる動画は切り出しを案内して断る', () => {
    const r = checkVideoLimits({ ...info, durationSec: 60, frameCount: 3600 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('20秒');
  });

  it('大きすぎるファイル（4K など）は断る', () => {
    const r = checkVideoLimits({ ...info, fileSizeMB: 800 });
    expect(r.ok).toBe(false);
  });

  it('フレームが1枚も無い動画は断る', () => {
    expect(checkVideoLimits({ ...info, frameCount: 0 }).ok).toBe(false);
  });

  it('高 fps で短い動画でも、フレーム数が上限を超えれば断る', () => {
    expect(checkVideoLimits({ ...info, fps: 240, durationSec: 10, frameCount: 2400 }).ok).toBe(false);
  });
});
