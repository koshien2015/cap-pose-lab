import { describe, expect, it } from 'vitest';

import { runDetectLoop, withEnhancement, type LoopFrame, type RgbaInput } from './detectLoop';
import { enhanceRgba } from './enhance';
import type { FrameRecord } from './records';

interface Img {
  readonly id: number;
}

async function* framesOf(n: number): AsyncGenerator<LoopFrame<number, Img>> {
  for (let i = 0; i < n; i++) yield { index: i, input: i, image: { id: i } };
}

/** capFrames のコマでキャップを見つける検出。処理した順を order に残す */
function fakeDetect(capFrames: ReadonlySet<number>, order: number[]) {
  return async (frame: number): Promise<FrameRecord> => {
    order.push(frame);
    return { frame, cap: capFrames.has(frame) ? { frame, x: 0, y: 0, conf: 0.5 } : null, pitcher: null };
  };
}

function tracker() {
  const disposed: number[] = [];
  return { disposed, disposeImage: (m: Img) => disposed.push(m.id) };
}

describe('runDetectLoop', () => {
  it('キャップが無ければ5コマに1回だけ推論し、推論しなかったコマの画像は閉じる', async () => {
    const t = tracker();
    const result = await runDetectLoop(framesOf(12), { detect: fakeDetect(new Set(), []), disposeImage: t.disposeImage });
    expect(result.records.map((r) => r.frame)).toEqual([0, 5, 10]);
    expect(result.images.map((i) => i.frame)).toEqual([0, 5, 10]);
    expect(t.disposed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 11]);
  });

  it('見つけたら直前の4コマを遡って推論し、記録と画像は frame 順で返す', async () => {
    const order: number[] = [];
    const t = tracker();
    const result = await runDetectLoop(framesOf(25), { detect: fakeDetect(new Set([20]), order), disposeImage: t.disposeImage });
    expect(order.slice(0, 9)).toEqual([0, 5, 10, 15, 20, 16, 17, 18, 19]); // 処理の順は前後する
    expect(result.records.map((r) => r.frame)).toEqual([0, 5, 10, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(result.images.map((i) => i.frame)).toEqual(result.records.map((r) => r.frame));
    expect(t.disposed).not.toContain(16);
  });

  it('連続で推論している間に見つけても、遡りは起きない（すでに推論済み）', async () => {
    const order: number[] = [];
    await runDetectLoop(framesOf(30), { detect: fakeDetect(new Set([10, 12]), order), disposeImage: () => undefined });
    expect(order.filter((f) => f === 11)).toHaveLength(1);
  });

  it('lookback が 0 なら遡らない', async () => {
    const order: number[] = [];
    await runDetectLoop(framesOf(12), {
      detect: fakeDetect(new Set([10]), order),
      disposeImage: () => undefined,
      gate: { searchStride: 5, denseFrames: 30, lookback: 0 },
    });
    expect(order).toEqual([0, 5, 10, 11]);
  });

  it('中止したら、それまでに受け取った画像をすべて閉じて止まる', async () => {
    const controller = new AbortController();
    const t = tracker();
    const detect = async (frame: number): Promise<FrameRecord> => {
      if (frame === 10) controller.abort();
      return { frame, cap: null, pitcher: null };
    };
    const run = runDetectLoop(framesOf(20), { detect, disposeImage: t.disposeImage, signal: controller.signal });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(t.disposed.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('推論が失敗したら、失敗したコマを含めて画像を閉じて例外を伝える', async () => {
    const t = tracker();
    const detect = async (frame: number): Promise<FrameRecord> => {
      if (frame === 5) throw new Error('推論失敗');
      return { frame, cap: null, pitcher: null };
    };
    await expect(runDetectLoop(framesOf(8), { detect, disposeImage: t.disposeImage })).rejects.toThrow('推論失敗');
    expect(t.disposed.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('withEnhancement', () => {
  const content = { x: 0, y: 0, width: 1, height: 1 };
  const px = (v: number) => new Uint8ClampedArray([v, v, v, 255]);
  async function* rgbaFrames(values: readonly number[]): AsyncGenerator<LoopFrame<RgbaInput, Img>> {
    for (const [i, v] of values.entries()) yield { index: i, input: { rgba: px(v), width: 1, height: 1, content }, image: { id: i } };
  }

  it('前後のコマで強調し、先頭は prev = cur、末尾のコマは流さずに画像を閉じる', async () => {
    const t = tracker();
    const out: LoopFrame<RgbaInput, Img>[] = [];
    for await (const f of withEnhancement(rgbaFrames([10, 60, 200, 90]), t.disposeImage)) out.push(f);
    expect(out.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(Array.from(out[0].input.rgba)).toEqual(Array.from(enhanceRgba(px(10), px(10), px(60), 1, 1, content)));
    expect(Array.from(out[1].input.rgba)).toEqual(Array.from(enhanceRgba(px(10), px(60), px(200), 1, 1, content)));
    expect(t.disposed).toEqual([3]);
  });

  it('途中でやめたら、まだ流していないコマの画像を閉じる', async () => {
    const t = tracker();
    for await (const f of withEnhancement(rgbaFrames([10, 60, 200]), t.disposeImage)) {
      expect(f.index).toBe(0);
      break;
    }
    expect(t.disposed).toEqual([1]);
  });
});
