/**
 * モデルの取得。受信しながら進捗を出し、最後まで受け取れたものだけを Cache Storage に残す
 * （2回目以降はダウンロードしない。途中で切れたものは残さない）。
 */

export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, res: Response): Promise<void>;
}

export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

/** 推論エンジン本体（ORT の wasm）の目安サイズ。ブラウザの HTTP キャッシュ任せ */
export const ORT_RUNTIME_MB = 27;

const CACHE_NAME = 'cap-pose-lab-models-v1';

export async function openModelCache(): Promise<CacheLike | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null; // プライベートブラウズなどで使えない
  }
}

export async function isModelCached(url: string, cache: CacheLike | null): Promise<boolean> {
  if (!cache) return false;
  try {
    return (await cache.match(url)) !== undefined;
  } catch {
    return false;
  }
}

/** 大きさが分かっているときは最初に確保して直接書き込む（受信中にモデル2つ分のメモリを使わないため） */
async function readAll(res: Response, onProgress: (received: number, total: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  // 圧縮して配信されると Content-Length は圧縮後の大きさになり、届く本文（展開後）と合わない
  const encoded = res.headers.get('content-encoding') !== null;
  const total = encoded ? 0 : Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    onProgress(bytes.byteLength, total);
    return bytes;
  }
  const reader = res.body.getReader();
  const preallocated = total > 0 ? new Uint8Array(total) : null;
  const parts: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (preallocated) {
      if (received + value.byteLength > total) {
        throw new DownloadError(`想定より大きなデータが届きました（${received + value.byteLength}/${total} バイト）`);
      }
      preallocated.set(value, received);
    } else {
      parts.push(value);
    }
    received += value.byteLength;
    onProgress(received, total);
  }
  if (preallocated) {
    if (received !== total) throw new DownloadError(`ダウンロードが途中で切れました（${received}/${total} バイト）`);
    return preallocated;
  }
  const out = new Uint8Array(received);
  parts.reduce((offset, part) => {
    out.set(part, offset);
    return offset + part.byteLength;
  }, 0);
  return out;
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export async function fetchModel(
  url: string,
  cache: CacheLike | null,
  onProgress: (receivedBytes: number, totalBytes: number) => void,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const cached = cache ? await cache.match(url).catch(() => undefined) : undefined;
  if (cached) return new Uint8Array(await cached.arrayBuffer());

  let res: Response;
  try {
    res = await fetchImpl(url, { signal });
  } catch (error) {
    if (isAbort(error)) throw error; // 中止は失敗扱いにしない
    throw new DownloadError(`通信できませんでした: ${String(error)}`);
  }
  if (!res.ok) throw new DownloadError(`モデルを取得できませんでした（HTTP ${res.status}）`);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await readAll(res, onProgress);
  } catch (error) {
    if (isAbort(error) || error instanceof DownloadError) throw error;
    throw new DownloadError(`受信中に通信が切れました: ${String(error)}`);
  }
  if (cache) {
    await cache.put(url, new Response(bytes)).catch(() => undefined); // 容量不足でも解析は続ける
  }
  return bytes;
}
