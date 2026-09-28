/**
 * 解析にかかる時間の見積もり。
 * 基準値は Mac Chrome の実測（設計書 §6.1）。スマホは未計測なので3倍で仮置きし、
 * 一度解析したら実測値（speedStore）に置き換わる。
 */

import type { ModeId } from './manifest';
import type { ExecutionProvider } from './recommend';

const BASE_MS_PER_FRAME: Record<ModeId, Record<ExecutionProvider, number>> = {
  fast: { webgpu: 30, wasm: 500 },
  standard: { webgpu: 50, wasm: 1500 },
  detailed: { webgpu: 95, wasm: 4000 },
};
const MOBILE_FACTOR = 3;

export function estimateSeconds(
  frames: number,
  mode: ModeId,
  ep: ExecutionProvider,
  opts: { isMobile: boolean; measuredMsPerFrame?: number },
): number {
  const measured = opts.measuredMsPerFrame;
  const msPerFrame =
    measured !== undefined && Number.isFinite(measured) && measured > 0
      ? measured
      : BASE_MS_PER_FRAME[mode][ep] * (opts.isMobile ? MOBILE_FACTOR : 1);
  return (frames * msPerFrame) / 1000;
}
