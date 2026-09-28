/**
 * 解析を始める前の動画チェック。スマホでメモリ不足にならない範囲に収める。
 */

import type { VideoInfo } from './videoSource';

export const MAX_DURATION_SEC = 20;
export const MAX_FRAMES = 1200;
/** 読み込み時に一時的にファイルの約2倍のメモリを使うため、読み込む前にこの大きさで断る */
export const MAX_FILE_MB = 200;

export type LimitResult = { ok: true } | { ok: false; message: string };

const TOO_LARGE =
  'ファイルが大きすぎます。カメラの解像度を 1080p（フルHD）にして撮り直すか、短く切り出してください';

/** ファイルを読み込む前に大きさだけで判定する（読み込んでからではスマホが落ちることがある） */
export function checkFileSize(sizeBytes: number): LimitResult {
  return sizeBytes > MAX_FILE_MB * 1024 * 1024 ? { ok: false, message: TOO_LARGE } : { ok: true };
}

export function checkVideoLimits(info: VideoInfo): LimitResult {
  if (info.frameCount <= 0 || !(info.fps > 0)) {
    return { ok: false, message: 'この動画からは映像を読み取れませんでした。別の動画を選んでください' };
  }
  if (info.durationSec > MAX_DURATION_SEC) {
    return {
      ok: false,
      message: `動画が長すぎます（${Math.round(info.durationSec)}秒）。投球の前後だけ、${MAX_DURATION_SEC}秒以内に切り出してから選んでください`,
    };
  }
  if (info.frameCount > MAX_FRAMES) {
    const maxSec = Math.floor(MAX_FRAMES / info.fps);
    return {
      ok: false,
      message: `コマ数が多すぎます（${Math.round(info.fps)}コマ/秒）。スローモーションではなく通常の 60コマ/秒 で撮るか、${maxSec}秒以内に切り出してください`,
    };
  }
  if (info.fileSizeMB > MAX_FILE_MB) return { ok: false, message: TOO_LARGE };
  return { ok: true };
}
