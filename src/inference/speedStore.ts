/**
 * 端末ごとの実測速度（ミリ秒/フレーム）を localStorage に残す。推定時間の精度を上げるためだけに使う。
 */

import type { ModeId } from './manifest';
import type { ExecutionProvider } from './recommend';

/** 姿勢推定のモードごと、またはキャップ検出（1回の推論あたり） */
export type SpeedKey = ModeId | 'capDetect';

const key = (mode: SpeedKey, ep: ExecutionProvider) => `capPoseLab.speed.${mode}.${ep}`;

function defaultStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadMeasuredSpeed(
  mode: SpeedKey,
  ep: ExecutionProvider,
  storage: Storage | undefined = defaultStorage(),
): number | undefined {
  try {
    const value = Number(storage?.getItem(key(mode, ep)));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveMeasuredSpeed(
  mode: SpeedKey,
  ep: ExecutionProvider,
  msPerFrame: number,
  storage: Storage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(key(mode, ep), String(msPerFrame));
  } catch {
    // 保存できなくても見積もりが粗くなるだけ
  }
}
