// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { type CacheLike, DownloadError, fetchModel, isModelCached } from './modelStore';

class MemoryCache implements CacheLike {
  readonly store = new Map<string, Uint8Array<ArrayBuffer>>();
  async match(url: string) {
    const bytes = this.store.get(url);
    return bytes ? new Response(bytes) : undefined;
  }
  async put(url: string, res: Response) {
    this.store.set(url, new Uint8Array(await res.arrayBuffer()));
  }
}

function streamResponse(chunks: Uint8Array[], contentLength: number | null, status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
  const headers = contentLength === null ? undefined : { 'content-length': String(contentLength) };
  return new Response(body, { status, headers });
}

describe('fetchModel', () => {
  it('受信しながら進捗を出し、終わったらキャッシュに入れる', async () => {
    const cache = new MemoryCache();
    const progress = vi.fn();
    const fetchImpl = vi.fn(async () => streamResponse([new Uint8Array([1, 2]), new Uint8Array([3])], 3));
    const bytes = await fetchModel('/m.onnx', cache, progress, fetchImpl as unknown as typeof fetch);
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
    expect(await isModelCached('/m.onnx', cache)).toBe(true);
  });

  it('キャッシュにあれば取りに行かない', async () => {
    const cache = new MemoryCache();
    cache.store.set('/m.onnx', new Uint8Array([9]));
    const fetchImpl = vi.fn();
    const bytes = await fetchModel('/m.onnx', cache, () => undefined, fetchImpl as unknown as typeof fetch);
    expect(Array.from(bytes)).toEqual([9]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('途中で切れたら DownloadError にし、キャッシュに残さない', async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi.fn(async () => streamResponse([new Uint8Array([1])], 10));
    await expect(fetchModel('/m.onnx', cache, () => undefined, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(
      DownloadError,
    );
    expect(await isModelCached('/m.onnx', cache)).toBe(false);
  });

  it('HTTP エラーは DownloadError にする', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([], 0, 404));
    await expect(fetchModel('/m.onnx', null, () => undefined, fetchImpl as unknown as typeof fetch)).rejects.toThrow('404');
  });

  it('通信そのものの失敗も DownloadError にする', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchModel('/m.onnx', null, () => undefined, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(
      DownloadError,
    );
  });

  it('失敗のあと再試行すれば取り直せる', async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => streamResponse([new Uint8Array([1])], 2))
      .mockImplementationOnce(async () => streamResponse([new Uint8Array([1, 2])], 2));
    const f = fetchImpl as unknown as typeof fetch;
    await expect(fetchModel('/m.onnx', cache, () => undefined, f)).rejects.toBeInstanceOf(DownloadError);
    expect(Array.from(await fetchModel('/m.onnx', cache, () => undefined, f))).toEqual([1, 2]);
  });

  it('中止されたら AbortError を投げ、DownloadError にしない', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return streamResponse([new Uint8Array([1])], 1);
    });
    const promise = fetchModel('/m.onnx', null, () => undefined, fetchImpl as unknown as typeof fetch, controller.signal);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(promise).rejects.not.toBeInstanceOf(DownloadError);
  });

  it('Content-Length より多く届いたら DownloadError にする', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([new Uint8Array([1, 2, 3])], 2));
    await expect(fetchModel('/m.onnx', null, () => undefined, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(
      DownloadError,
    );
  });

  it('Content-Length が無くても読める（進捗の合計は 0）', async () => {
    const progress = vi.fn();
    const fetchImpl = vi.fn(async () => streamResponse([new Uint8Array([5, 6])], null));
    const bytes = await fetchModel('/m.onnx', null, progress, fetchImpl as unknown as typeof fetch);
    expect(Array.from(bytes)).toEqual([5, 6]);
    expect(progress).toHaveBeenLastCalledWith(2, 0);
  });
});
