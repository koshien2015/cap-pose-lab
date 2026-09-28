import { describe, expect, it } from 'vitest';

import { DownloadError } from '../inference/modelStore';
import { friendlyError } from './errors';

describe('friendlyError', () => {
  it('ダウンロードの失敗は再試行と Wi-Fi をすすめる', () => {
    const e = friendlyError(new DownloadError('途中で切れました'));
    expect(e.title).toContain('ダウンロード');
    expect(e.action).toContain('Wi-Fi');
    expect(e.detail).toContain('途中で切れました');
  });

  it('キャンセルは失敗扱いにしない文言', () => {
    expect(friendlyError(new DOMException('aborted', 'AbortError')).title).toContain('中止');
  });

  it('デコードの失敗は撮影設定の変え方を案内する', () => {
    const e = friendlyError(new Error('デコードに失敗しました: bad'));
    expect(e.action).toContain('互換性優先');
  });

  it('準備に失敗したとき（通常処理への切り替えも失敗）は、ほかのアプリを閉じての再試行をすすめる', () => {
    const e = friendlyError(new Error('セッションを作れませんでした（wasm）: x'));
    expect(e.action).toContain('ほかのアプリ');
    expect(e.action).not.toContain('はやい');
    expect(e.retryable).toBe(true);
  });

  it('ダウンロードの失敗は「もう一度試す」で再試行できる', () => {
    expect(friendlyError(new DownloadError('x')).retryable).toBe(true);
  });

  it('中止と、動画そのものの問題は再試行ボタンを出さない', () => {
    expect(friendlyError(new DOMException('aborted', 'AbortError')).retryable).toBe(false);
    expect(friendlyError(new Error('デコードに失敗しました')).retryable).toBe(false);
  });

  it('想定外のエラーも、次の行動を必ず示す', () => {
    const e = friendlyError('???');
    expect(e.title.length).toBeGreaterThan(0);
    expect(e.action.length).toBeGreaterThan(0);
  });

  it('主な文言に専門用語を出さない', () => {
    const all = [new DownloadError('x'), new Error('デコードに失敗しました'), new Error('セッションを作れませんでした')]
      .map(friendlyError)
      .flatMap((e) => [e.title, e.action])
      .join();
    expect(all).not.toMatch(/WebGPU|wasm|ONNX|WebCodecs|セッション/);
  });
});
