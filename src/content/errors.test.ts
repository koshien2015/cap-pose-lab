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

  it('セッションを作れないときは「はやい」をすすめる', () => {
    expect(friendlyError(new Error('セッションを作れませんでした（webgpu）: x')).action).toContain('はやい');
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
