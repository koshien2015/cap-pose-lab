import { describe, expect, it } from 'vitest';

import type { CapabilityReport } from './capabilities';
import { recommend } from './recommend';

const base: CapabilityReport = {
  userAgent: 'test',
  isMobile: false,
  hardwareConcurrency: 8,
  deviceMemoryGB: 8,
  secureContext: true,
  crossOriginIsolated: false,
  gpu: { apiPresent: true, adapterFound: true, shaderF16: true, isFallbackAdapter: false },
  webCodecs: true,
  codecs: [{ label: 'H.264', codec: 'avc1.640028', supported: true }],
  wasm: true,
  wasmSimd: true,
  wasmThreads: false,
};

describe('recommend', () => {
  it('GPU が使えればすべてのモードを選べて、おすすめは「ふつう」', () => {
    const r = recommend(base);
    expect(r.verdict).toBe('ok');
    expect(r.executionProvider).toBe('webgpu');
    expect(r.allowedModes).toEqual(['fast', 'standard', 'detailed']);
    expect(r.recommendedMode).toBe('standard');
  });

  it('メモリが 4GB 以下の端末は「はやい」をすすめる', () => {
    expect(recommend({ ...base, deviceMemoryGB: 4 }).recommendedMode).toBe('fast');
  });

  it('GPU が無ければ「はやい」だけを選べて、理由を出す', () => {
    const r = recommend({ ...base, gpu: { apiPresent: false, adapterFound: false, shaderF16: false } });
    expect(r.verdict).toBe('limited');
    expect(r.executionProvider).toBe('wasm');
    expect(r.allowedModes).toEqual(['fast']);
    expect(r.messages.join()).toContain('高速モード');
  });

  it('ソフトウェア実装の GPU は使えないものとして扱う', () => {
    const r = recommend({ ...base, gpu: { ...base.gpu, isFallbackAdapter: true } });
    expect(r.executionProvider).toBe('wasm');
  });

  it('動画を読めない環境では何も選べない', () => {
    const r = recommend({ ...base, webCodecs: false });
    expect(r.verdict).toBe('unsupported');
    expect(r.allowedModes).toEqual([]);
    expect(r.recommendedMode).toBeNull();
    expect(r.messages.join()).toContain('動画');
  });

  it('HTTPS でなければ何も選べない', () => {
    expect(recommend({ ...base, secureContext: false }).verdict).toBe('unsupported');
  });

  it('主画面向けの文言に専門用語を含めない', () => {
    const texts = [
      ...recommend(base).messages,
      ...recommend({ ...base, gpu: { apiPresent: false, adapterFound: false, shaderF16: false } }).messages,
      ...recommend({ ...base, webCodecs: false }).messages,
    ].join();
    expect(texts).not.toMatch(/WebGPU|wasm|WebCodecs|ONNX/i);
  });
});
