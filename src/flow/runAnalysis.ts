/**
 * 解析の段取りのうち、失敗や中止のときに取りこぼしやすい部分。
 * - 複数本の解析で途中失敗したら、終わった分の縮小画像を解放する（スマホのメモリ対策）
 * - 高速処理（GPU）でセッションを作れなければ、通常処理（CPU）で1回だけ作り直す
 */

import type { ExecutionProvider } from '../inference/recommend';

export async function analyzeAll<V, R extends { thumbnails: readonly ImageBitmap[] }>(
  videos: readonly V[],
  analyzeOne: (video: V, index: number) => Promise<R>,
): Promise<R[]> {
  const done: R[] = [];
  try {
    for (const [i, video] of videos.entries()) {
      done.push(await analyzeOne(video, i));
    }
    return done;
  } catch (error) {
    done.forEach((r) => r.thumbnails.forEach((b) => b.close()));
    throw error;
  }
}

export interface SessionResult<S> {
  readonly loaded: S;
  readonly ep: ExecutionProvider;
  readonly fellBack: boolean;
}

export async function createSessionWithFallback<S>(
  bytes: Uint8Array,
  ep: ExecutionProvider,
  create: (bytes: Uint8Array, ep: ExecutionProvider) => Promise<S>,
): Promise<SessionResult<S>> {
  try {
    return { loaded: await create(bytes, ep), ep, fellBack: false };
  } catch (error) {
    if (ep !== 'webgpu') throw error;
    return { loaded: await create(bytes, 'wasm'), ep: 'wasm', fellBack: true };
  }
}
