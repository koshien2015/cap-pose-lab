/**
 * 1本分の検出の段取り（ブラウザに依存しない。ブラウザ側は inference/runDetect.ts）。
 * - 推論するかどうかは gate.ts で決める
 * - キャップを見つけたら、手元に残しておいた直前の推論していないコマ（最大 lookback）を遡って推論する
 * - 推論したコマだけ画像を残し、残さない画像はその場で閉じる。失敗・中止のときは受け取った画像をすべて閉じる
 * - 記録と画像は frame 順に並べて返す（遡った分で処理の順番が前後するため）
 */

import { enhanceRgba, type Rect } from './enhance';
import { DEFAULT_GATE, type GateConfig, INITIAL_GATE, noteDetection, shouldInfer } from './gate';
import type { FrameRecord } from './records';

export interface LoopFrame<I, M> {
  readonly index: number;
  readonly input: I;
  readonly image: M;
}

export interface FrameImage<M> {
  readonly frame: number;
  readonly image: M;
}

/** レターボックス済みの RGBA。content は余白を除いた映像の範囲 */
export interface RgbaInput {
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly content: Rect;
}

export interface DetectLoopDeps<I, M> {
  readonly detect: (frame: number, input: I) => Promise<FrameRecord>;
  readonly disposeImage: (image: M) => void;
  readonly gate?: GateConfig;
  readonly signal?: AbortSignal;
  /** 残す画像の上限（既定 DEFAULT_MAX_IMAGES） */
  readonly maxImages?: number;
}

/** 残す画像の上限。姿勢推定の縮小画像（frameCanvas.ts の MAX_THUMBNAILS）と同じ 320x180 x 300 枚 ≒ 69MB に抑える */
export const DEFAULT_MAX_IMAGES = 300;

/**
 * 上限を超えたら1枚手放す。キャップが写っていない（推論済みの）コマのうち最も古いものから手放し、
 * 無ければ最も古いものを手放す。検出が続く動画（捕球後に止まったキャップなど）でもメモリが増え続けないようにする。
 */
function trimImages<M>(
  images: readonly FrameImage<M>[],
  records: readonly FrameRecord[],
  max: number,
  dispose: (image: M) => void,
): FrameImage<M>[] {
  if (images.length <= max) return [...images];
  const withoutCap = new Set(records.filter((r) => r.cap === null).map((r) => r.frame));
  const found = images.findIndex((im) => withoutCap.has(im.frame));
  const drop = found >= 0 ? found : 0;
  dispose(images[drop].image);
  return images.filter((_, i) => i !== drop);
}

const byFrame = <T extends { frame: number }>(items: readonly T[]) => [...items].sort((a, b) => a.frame - b.frame);

export async function runDetectLoop<I, M>(
  frames: AsyncIterable<LoopFrame<I, M>>,
  deps: DetectLoopDeps<I, M>,
): Promise<{ records: FrameRecord[]; images: FrameImage<M>[] }> {
  const config = deps.gate ?? DEFAULT_GATE;
  const maxImages = deps.maxImages ?? DEFAULT_MAX_IMAGES;
  const records: FrameRecord[] = [];
  let images: FrameImage<M>[] = [];
  let held: LoopFrame<I, M>[] = [];
  let gate = INITIAL_GATE;
  const infer = async (f: LoopFrame<I, M>) => {
    images = [...images, { frame: f.index, image: f.image }]; // 先に持ち主を移す（推論が失敗しても閉じられるように）
    const record = await deps.detect(f.index, f.input);
    records.push(record);
    images = trimImages(images, records, maxImages, deps.disposeImage);
    return record;
  };
  try {
    for await (const f of frames) {
      if (deps.signal?.aborted) {
        deps.disposeImage(f.image); // 受け取ったばかりで、まだ誰も持っていない
        deps.signal.throwIfAborted();
      }
      if (!shouldInfer(gate, f.index, config)) {
        const next = [...held, f];
        const drop = Math.max(0, next.length - config.lookback);
        next.slice(0, drop).forEach((h) => deps.disposeImage(h.image));
        held = next.slice(drop);
        continue;
      }
      const record = await infer(f);
      gate = noteDetection(gate, f.index, record.cap !== null, config);
      const back = record.cap ? held.filter((h) => h.index >= f.index - config.lookback) : [];
      held.filter((h) => !back.includes(h)).forEach((h) => deps.disposeImage(h.image));
      held = back;
      while (held.length > 0) {
        const [h, ...rest] = held;
        await infer(h);
        held = rest;
      }
    }
  } catch (error) {
    [...held.map((h) => h.image), ...images.map((i) => i.image)].forEach(deps.disposeImage);
    throw error;
  }
  held.forEach((h) => deps.disposeImage(h.image));
  return { records: byFrame(records), images: byFrame(images) };
}

/**
 * enhanced 用: 各コマを前後のコマとの差分で強調して流す（tennis.run と同じ並び）。
 * 先頭は prev = cur、末尾のコマは流さずに画像を閉じる。途中でやめたときも、まだ流していないコマの画像を閉じる。
 */
export async function* withEnhancement<I extends RgbaInput, M>(
  frames: AsyncIterable<LoopFrame<I, M>>,
  disposeImage: (image: M) => void,
): AsyncGenerator<LoopFrame<I, M>> {
  let prev: LoopFrame<I, M> | null = null;
  let cur: LoopFrame<I, M> | null = null;
  try {
    for await (const next of frames) {
      const before = prev;
      const current = cur;
      prev = cur;
      cur = next; // 流す前に持ち替える（やめたときに閉じる対象を next にするため）
      if (!current) continue;
      const { rgba, width, height, content } = current.input;
      const enhanced = enhanceRgba((before ?? current).input.rgba, rgba, next.input.rgba, width, height, content);
      yield { ...current, input: { ...current.input, rgba: enhanced } };
    }
  } finally {
    if (cur) disposeImage(cur.image);
  }
}
