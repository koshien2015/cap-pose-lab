/**
 * onnxruntime-web の読み込みとセッション生成。
 * ORT はブラウザ専用なのでクライアントで動的 import する（SSR で読まない）。
 * wasm 本体は scripts/copy-ort-wasm.mjs が public/ort/ に同一バージョンを複製したものを使う。
 */

import type * as OrtModule from 'onnxruntime-web';

import type { ExecutionProvider } from './recommend';

type Ort = typeof OrtModule;

const WASM_BASE = `${import.meta.env.BASE_URL}ort/`;
export const ORT_WASM_URL = `${WASM_BASE}ort-wasm-simd-threaded.jsep.wasm`;
const ORT_MJS_URL = `${WASM_BASE}ort-wasm-simd-threaded.jsep.mjs`;

let ortPromise: Promise<Ort> | null = null;
/** wasm 本体（約 28MB）は最初のセッション生成時に取得される */
let runtimeLoaded = false;

export function isOrtRuntimeLoaded(): boolean {
  return runtimeLoaded;
}

export function loadOrt(): Promise<Ort> {
  ortPromise ??= import('onnxruntime-web').then((ort) => {
    // mjs も明示する。省略するとバンドル済みチャンク（import.meta.url）がスレッド用 Worker に
    // 読み込まれ、セッション生成が戻ってこなくなる（Next.js で確認）
    ort.env.wasm.wasmPaths = { mjs: ORT_MJS_URL, wasm: ORT_WASM_URL };
    ort.env.wasm.numThreads = window.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    ort.env.logLevel = 'warning';
    return ort;
  });
  return ortPromise;
}

export interface LoadedSession {
  readonly session: OrtModule.InferenceSession;
  readonly createMs: number;
  /** セッション生成中に ORT が出した警告（WebGPU で CPU に回されたノードの検出用） */
  readonly warnings: readonly string[];
  readonly wasmThreads: number;
}

/** console への出力を一時的に横取りする（ORT の警告は console 経由でしか取れない）。 */
async function captureConsole<T>(fn: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = [];
  const original = { warn: console.warn, error: console.error };
  const capture =
    (orig: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
      orig(...args);
    };
  console.warn = capture(original.warn);
  console.error = capture(original.error);
  try {
    return { value: await fn(), lines };
  } finally {
    console.warn = original.warn;
    console.error = original.error;
  }
}

export async function createSession(model: Uint8Array, ep: ExecutionProvider): Promise<LoadedSession> {
  const ort = await loadOrt();
  const started = performance.now();
  try {
    const { value: session, lines } = await captureConsole(() =>
      ort.InferenceSession.create(model, {
        executionProviders: [ep],
        graphOptimizationLevel: 'all',
      }),
    );
    runtimeLoaded = true;
    return {
      session,
      createMs: performance.now() - started,
      warnings: lines,
      wasmThreads: ort.env.wasm.numThreads ?? 1,
    };
  } catch (error) {
    throw new Error(`セッションを作れませんでした（${ep}）: ${String(error)}`);
  }
}

export async function runPose(
  session: OrtModule.InferenceSession,
  input: Float32Array,
  width: number,
  height: number,
): Promise<Float32Array> {
  const ort = await loadOrt();
  const tensor = new ort.Tensor('float32', input, [1, 3, height, width]);
  try {
    const outputs = await session.run({ [session.inputNames[0]]: tensor });
    const out = outputs[session.outputNames[0]];
    const data = (await out.getData()) as Float32Array;
    out.dispose();
    return data;
  } finally {
    tensor.dispose();
  }
}
