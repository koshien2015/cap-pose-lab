import { describe, expect, it, vi } from 'vitest';

import { analyzeAll, createSessionWithFallback } from './runAnalysis';

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;

describe('analyzeAll', () => {
  it('順に解析して結果を返す', async () => {
    const out = await analyzeAll(['a', 'b'], async (v) => ({ name: v, thumbnails: [bitmap()] }));
    expect(out.map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('2本目の途中で失敗・中止したら、1本目の縮小画像を解放してから投げ直す', async () => {
    const first = [bitmap(), bitmap()];
    const analyze = vi
      .fn()
      .mockResolvedValueOnce({ name: 'a', thumbnails: first })
      .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    await expect(analyzeAll(['a', 'b'], analyze)).rejects.toMatchObject({ name: 'AbortError' });
    first.forEach((b) => expect(b.close).toHaveBeenCalled());
  });
});

describe('createSessionWithFallback', () => {
  const bytes = new Uint8Array([1]);

  it('高速処理で作れればそのまま使う', async () => {
    const create = vi.fn(async () => ({ id: 'gpu' }));
    const r = await createSessionWithFallback(bytes, 'webgpu', create);
    expect(r).toEqual({ loaded: { id: 'gpu' }, ep: 'webgpu', fellBack: false });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('高速処理で作れなければ、通常処理で1回だけ作り直す', async () => {
    const create = vi.fn(async (_b: Uint8Array, ep: string) => {
      if (ep === 'webgpu') throw new Error('セッションを作れませんでした（webgpu）');
      return { id: 'cpu' };
    });
    const r = await createSessionWithFallback(bytes, 'webgpu', create);
    expect(r).toEqual({ loaded: { id: 'cpu' }, ep: 'wasm', fellBack: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('通常処理でも作れなければ、その失敗を投げる', async () => {
    const create = vi.fn(async (_b: Uint8Array, ep: string) => {
      throw new Error(`fail ${ep}`);
    });
    await expect(createSessionWithFallback(bytes, 'webgpu', create)).rejects.toThrow('fail wasm');
  });

  it('最初から通常処理なら作り直さない', async () => {
    const create = vi.fn(async () => {
      throw new Error('fail wasm');
    });
    await expect(createSessionWithFallback(bytes, 'wasm', create)).rejects.toThrow('fail wasm');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
