/**
 * 推論の間引き（SHARED の prefilter.py の InferenceGate の移植。投球区間の窓は使わない＝常に区間内）。
 * キャップが見つかるまでは searchStride コマに1回だけ推論し、見つけたら denseFrames のあいだ連続で推論する。
 * 見つけたときに直前の推論していないコマ（最大 lookback）を遡って推論するのは、この計画で足した動き（detectLoop.ts が行う）。
 */

export interface GateConfig {
  readonly searchStride: number;
  readonly denseFrames: number;
  readonly lookback: number;
}

export const DEFAULT_GATE: GateConfig = { searchStride: 5, denseFrames: 30, lookback: 4 };

/** 全コマ推論（間引き幅 1）。間引きで飛行中のコマを取りこぼすのが心配なときに使う。時間は約5倍かかる */
export const FULL_GATE: GateConfig = { ...DEFAULT_GATE, searchStride: 1 };

/** 推論のしかた（sampled: 見つかるまで間引く / all: 全コマ） */
export type InferenceMode = 'sampled' | 'all';

export const gateFor = (mode: InferenceMode): GateConfig => (mode === 'all' ? FULL_GATE : DEFAULT_GATE);

export interface GateState {
  readonly denseUntil: number;
}

export const INITIAL_GATE: GateState = { denseUntil: -1 };

export function shouldInfer(state: GateState, frame: number, config: GateConfig = DEFAULT_GATE): boolean {
  if (config.searchStride < 1) throw new Error('searchStride は1以上である必要があります');
  return frame <= state.denseUntil || frame % config.searchStride === 0;
}

export function noteDetection(state: GateState, frame: number, found: boolean, config: GateConfig = DEFAULT_GATE): GateState {
  return found ? { denseUntil: frame + config.denseFrames } : state;
}

/** 見積もり用: 間引きの分 + 見つけた後の連続の分 + 遡りの分（コマ数を超えない） */
export function expectedInferences(frameCount: number, config: GateConfig = DEFAULT_GATE): number {
  return Math.min(frameCount, Math.ceil(frameCount / config.searchStride) + config.denseFrames + config.lookback);
}
