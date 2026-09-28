/**
 * ブラウザで姿勢推定を動かせるかの判定（検出だけ。判断は recommend.ts）。
 */

export interface GpuReport {
  readonly apiPresent: boolean;
  readonly adapterFound: boolean;
  readonly vendor?: string;
  readonly architecture?: string;
  readonly description?: string;
  readonly isFallbackAdapter?: boolean;
  readonly shaderF16: boolean;
  readonly maxBufferSizeMB?: number;
  readonly maxStorageBufferBindingSizeMB?: number;
  readonly error?: string;
}

export interface CodecReport {
  readonly label: string;
  readonly codec: string;
  readonly supported: boolean;
}

export interface CapabilityReport {
  readonly userAgent: string;
  readonly isMobile: boolean;
  readonly hardwareConcurrency: number;
  readonly deviceMemoryGB?: number;
  readonly secureContext: boolean;
  readonly crossOriginIsolated: boolean;
  readonly gpu: GpuReport;
  readonly webCodecs: boolean;
  readonly codecs: readonly CodecReport[];
  readonly wasm: boolean;
  readonly wasmSimd: boolean;
  readonly wasmThreads: boolean;
}

// 最小限の WebGPU 型（ブラウザ間で info の有無や isFallbackAdapter の場所が違うため）
interface GpuAdapterLike {
  readonly features: { has(name: string): boolean };
  readonly limits: { maxBufferSize: number; maxStorageBufferBindingSize: number };
  readonly info?: { vendor?: string; architecture?: string; description?: string; isFallbackAdapter?: boolean };
  readonly isFallbackAdapter?: boolean;
}
interface GpuLike {
  requestAdapter(options?: { powerPreference?: string }): Promise<GpuAdapterLike | null>;
}

const CODECS: readonly Omit<CodecReport, 'supported'>[] = [
  { label: 'H.264 1080p30', codec: 'avc1.640028' },
  { label: 'H.264 1080p60', codec: 'avc1.64002A' },
  { label: 'HEVC 1080p（iPhone 標準）', codec: 'hvc1.1.6.L123.B0' },
  { label: 'HEVC 10bit（iPhone HDR）', codec: 'hvc1.2.4.L123.B0' },
];

// wasm-feature-detect の SIMD 判定用モジュール
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

const MB = 1024 * 1024;

async function detectGpu(): Promise<GpuReport> {
  // TS 6 の lib.dom には WebGPU 型があるが、古いブラウザ向けに info / isFallbackAdapter の揺れを吸収する最小型で読む
  const gpu = (navigator as unknown as { gpu?: GpuLike }).gpu;
  if (!gpu) return { apiPresent: false, adapterFound: false, shaderF16: false };
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { apiPresent: true, adapterFound: false, shaderF16: false, error: 'アダプタを取得できません' };
    return {
      apiPresent: true,
      adapterFound: true,
      vendor: adapter.info?.vendor,
      architecture: adapter.info?.architecture,
      description: adapter.info?.description,
      isFallbackAdapter: adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter,
      shaderF16: adapter.features.has('shader-f16'),
      maxBufferSizeMB: Math.round(adapter.limits.maxBufferSize / MB),
      maxStorageBufferBindingSizeMB: Math.round(adapter.limits.maxStorageBufferBindingSize / MB),
    };
  } catch (error) {
    return { apiPresent: true, adapterFound: false, shaderF16: false, error: String(error) };
  }
}

async function detectCodecs(): Promise<CodecReport[]> {
  if (typeof VideoDecoder === 'undefined') return CODECS.map((c) => ({ ...c, supported: false }));
  return Promise.all(
    CODECS.map(async (c) => {
      try {
        const res = await VideoDecoder.isConfigSupported({ codec: c.codec, codedWidth: 1920, codedHeight: 1080 });
        return { ...c, supported: Boolean(res.supported) };
      } catch {
        return { ...c, supported: false };
      }
    }),
  );
}

export async function detectCapabilities(): Promise<CapabilityReport> {
  const wasm = typeof WebAssembly === 'object';
  const [gpu, codecs] = await Promise.all([detectGpu(), detectCodecs()]);
  return {
    userAgent: navigator.userAgent,
    isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    hardwareConcurrency: navigator.hardwareConcurrency ?? 1,
    deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    secureContext: window.isSecureContext,
    crossOriginIsolated: window.crossOriginIsolated === true,
    gpu,
    webCodecs: typeof VideoDecoder !== 'undefined',
    codecs,
    wasm,
    wasmSimd: wasm && WebAssembly.validate(SIMD_PROBE),
    wasmThreads: wasm && typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated === true,
  };
}
