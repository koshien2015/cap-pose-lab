/**
 * 選ばれた動画を解析できる状態にする。スマホで落ちないよう、
 * 大きさは読み込む前に確かめ、1本ずつ読み込み、使えない動画はメモリに残さない。
 */

import { friendlyError } from '../content/errors';
import { checkFileSize, checkVideoLimits } from '../inference/videoLimits';
import type { DemuxedVideo } from '../inference/videoSource';

export interface PickedVideo {
  readonly file: File;
  readonly video: DemuxedVideo | null;
  readonly problem: string | null;
}

export const MAX_VIDEOS = 2;

const UNDECODABLE = new Error('デコードに失敗しました: この端末ではこの形式の動画を再生できません');

function describe(error: unknown): string {
  const e = friendlyError(error);
  return `${e.title}。${e.action}`;
}

async function loadOne(
  file: File,
  demux: (file: File) => Promise<DemuxedVideo>,
  isSupported: (config: VideoDecoderConfig) => Promise<boolean>,
): Promise<PickedVideo> {
  const size = checkFileSize(file.size);
  if (!size.ok) return { file, video: null, problem: size.message };
  try {
    const video = await demux(file);
    const limit = checkVideoLimits(video.info);
    if (!limit.ok) return { file, video: null, problem: limit.message };
    if (!(await isSupported(video.config))) return { file, video: null, problem: describe(UNDECODABLE) };
    return { file, video, problem: null };
  } catch (error) {
    return { file, video: null, problem: describe(error) };
  }
}

export async function loadPickedVideos(
  files: readonly File[],
  demux: (file: File) => Promise<DemuxedVideo>,
  isSupported: (config: VideoDecoderConfig) => Promise<boolean>,
): Promise<PickedVideo[]> {
  const out: PickedVideo[] = [];
  for (const file of files.slice(0, MAX_VIDEOS)) {
    out.push(await loadOne(file, demux, isSupported)); // 同時に読むとメモリが倍になるので1本ずつ
  }
  return out;
}

export async function isDecoderSupported(config: VideoDecoderConfig): Promise<boolean> {
  try {
    return typeof VideoDecoder !== 'undefined' && Boolean((await VideoDecoder.isConfigSupported(config)).supported);
  } catch {
    return false;
  }
}
