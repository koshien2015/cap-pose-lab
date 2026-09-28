import { describe, expect, it } from 'vitest';

import type { VideoInfo } from './videoSource';
import { checkFileSize, checkVideoLimits, MAX_FILE_MB } from './videoLimits';

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

  it('高 fps で短い動画（スロー撮影）は、長さではなくコマ数が多いと案内する', () => {
    const r = checkVideoLimits({ ...info, fps: 240, durationSec: 10, frameCount: 2400 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain('長すぎます');
      expect(r.message).toContain('240');
      expect(r.message).toContain('60');
    }
  });

  it('fps が読み取れない動画は断る', () => {
    expect(checkVideoLimits({ ...info, fps: 0 }).ok).toBe(false);
  });
});

describe('checkFileSize', () => {
  it('読み込む前に、大きすぎるファイルを断る', () => {
    const r = checkFileSize(800 * 1024 * 1024);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('1080p');
  });

  it('上限以下なら通す', () => {
    expect(checkFileSize(MAX_FILE_MB * 1024 * 1024)).toEqual({ ok: true });
  });
});
