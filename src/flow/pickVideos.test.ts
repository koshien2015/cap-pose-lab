import { describe, expect, it, vi } from 'vitest';

import { loadPickedVideos } from './pickVideos';
import type { DemuxedVideo } from '../inference/videoSource';

const MB = 1024 * 1024;
const fileOf = (name: string, sizeMB: number) => ({ name, size: sizeMB * MB }) as File;

const demuxed = (overrides: Partial<DemuxedVideo['info']> = {}): DemuxedVideo => ({
  info: {
    codec: 'avc1.640029', codedWidth: 1920, codedHeight: 1080, rotation: 0,
    fps: 60, frameCount: 300, durationSec: 5, fileSizeMB: 20, ...overrides,
  },
  config: { codec: 'avc1.640029' },
  chunks: [],
});

describe('loadPickedVideos', () => {
  const supported = async () => true;

  it('大きすぎるファイルは読み込まずに断る', async () => {
    const demux = vi.fn(async () => demuxed());
    const [p] = await loadPickedVideos([fileOf('big.mov', 900)], demux, supported);
    expect(demux).not.toHaveBeenCalled();
    expect(p.video).toBeNull();
    expect(p.problem).toContain('1080p');
  });

  it('上限を超えた動画はメモリに残さない（video を捨てる）', async () => {
    const [p] = await loadPickedVideos([fileOf('long.mov', 50)], async () => demuxed({ durationSec: 60, frameCount: 3600 }), supported);
    expect(p.video).toBeNull();
    expect(p.problem).toContain('長すぎます');
  });

  it('2本は同時ではなく1本ずつ読み込む', async () => {
    let running = 0;
    let maxRunning = 0;
    const demux = vi.fn(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return demuxed();
    });
    const out = await loadPickedVideos([fileOf('a.mov', 10), fileOf('b.mov', 10)], demux, supported);
    expect(maxRunning).toBe(1);
    expect(out.map((p) => p.problem)).toEqual([null, null]);
  });

  it('この端末でデコードできない動画は、選んだ時点で理由と対処を出す', async () => {
    const [p] = await loadPickedVideos([fileOf('hdr.mov', 10)], async () => demuxed(), async () => false);
    expect(p.video).toBeNull();
    expect(p.problem).toContain('読み込めませんでした');
    expect(p.problem).toContain('互換性優先');
  });

  it('読み込みに失敗した動画も、理由と対処の両方を出す', async () => {
    const [p] = await loadPickedVideos(
      [fileOf('broken.mov', 10)],
      async () => {
        throw new Error('MP4/MOV として読み込めませんでした');
      },
      supported,
    );
    expect(p.video).toBeNull();
    expect(p.problem).toContain('互換性優先');
  });

  it('3本以上選んだら先頭の2本だけを使う', async () => {
    const out = await loadPickedVideos([fileOf('a', 1), fileOf('b', 1), fileOf('c', 1)], async () => demuxed(), supported);
    expect(out).toHaveLength(2);
  });
});
