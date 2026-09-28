/**
 * 環境判定の結果から、選べる解析モードとおすすめを決める。
 * 画面に出す文言なので専門用語を使わない。
 */

import type { CapabilityReport } from './capabilities';
import type { ModeId } from './manifest';

export type ExecutionProvider = 'webgpu' | 'wasm';

export interface Recommendation {
  readonly verdict: 'ok' | 'limited' | 'unsupported';
  readonly executionProvider: ExecutionProvider | null;
  readonly allowedModes: readonly ModeId[];
  readonly recommendedMode: ModeId | null;
  readonly messages: readonly string[];
}

const ALL_MODES: readonly ModeId[] = ['fast', 'standard', 'detailed'];
const LOW_MEMORY_GB = 4;

function unsupportedReasons(report: CapabilityReport): string[] {
  const reasons: string[] = [];
  if (!report.secureContext) reasons.push('このページは https で開いてください');
  if (!report.webCodecs || !report.codecs.some((c) => c.supported)) {
    reasons.push('このブラウザでは動画を1コマずつ読み込めません。最新の Safari か Chrome で開いてください');
  }
  if (!report.wasm) reasons.push('このブラウザは解析に必要な機能に対応していません');
  return reasons;
}

export function recommend(report: CapabilityReport): Recommendation {
  const reasons = unsupportedReasons(report);
  if (reasons.length > 0) {
    return { verdict: 'unsupported', executionProvider: null, allowedModes: [], recommendedMode: null, messages: reasons };
  }
  const gpuOk = report.gpu.adapterFound && report.gpu.isFallbackAdapter !== true;
  if (!gpuOk) {
    return {
      verdict: 'limited',
      executionProvider: 'wasm',
      allowedModes: ['fast'],
      recommendedMode: 'fast',
      messages: ['この端末は高速モードに対応していないため、「はやい」だけを選べます。解析には少し時間がかかります'],
    };
  }
  const lowMemory = report.deviceMemoryGB !== undefined && report.deviceMemoryGB <= LOW_MEMORY_GB;
  return {
    verdict: 'ok',
    executionProvider: 'webgpu',
    allowedModes: ALL_MODES,
    recommendedMode: lowMemory ? 'fast' : 'standard',
    messages: ['この端末は高速モードで解析できます'],
  };
}
