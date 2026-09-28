/**
 * 解析を始める前の動画チェック。スマホでメモリ不足にならない範囲に収める。
 */

import type { VideoInfo } from './videoSource';

export const MAX_DURATION_SEC = 20;
export const MAX_FRAMES = 1200;
export const MAX_FILE_MB = 300;

export type LimitResult = { ok: true } | { ok: false; message: string };

export function checkVideoLimits(info: VideoInfo): LimitResult {
  if (info.frameCount <= 0) {
    return { ok: false, message: 'この動画からは映像を読み取れませんでした。別の動画を選んでください' };
  }
  if (info.durationSec > MAX_DURATION_SEC || info.frameCount > MAX_FRAMES) {
    return {
      ok: false,
      message: `動画が長すぎます（${Math.round(info.durationSec)}秒）。投球の前後だけ、${MAX_DURATION_SEC}秒以内に切り出してから選んでください`,
    };
  }
  if (info.fileSizeMB > MAX_FILE_MB) {
    return {
      ok: false,
      message: 'ファイルが大きすぎます。カメラの解像度を 1080p（フルHD）にして撮り直すか、短く切り出してください',
    };
  }
  return { ok: true };
}
