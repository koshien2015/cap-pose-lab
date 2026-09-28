/**
 * 1本の動画を最後まで推論する。フレームは1枚ずつ処理して閉じ、全フレームをメモリに溜めない。
 * 人物は全員分を残す（投手はあとで選び直せるように）。
 */

import type { InferenceSession } from 'onnxruntime-web';

import { decodePeople, type Person } from './decodePose';
import { estimateRemainingMs } from './eta';
import { displaySize, FramePreprocessor, makeThumbnail, thumbnailStride } from './frameCanvas';
import { runPose as runOrt } from './ortSession';
import { decodeFrames, type DemuxedVideo } from './videoSource';

export const CONF_THRESHOLD = 0.25;

export interface PoseRun {
  readonly fileName: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly frames: Person[][];
  readonly thumbnails: ImageBitmap[];
  /** 縮小画像を何コマおきに残したか。フレーム f の画像は thumbnails[f / thumbStride] */
  readonly thumbStride: number;
  readonly msPerFrame: number;
}

export async function analyzeVideo(
  video: DemuxedVideo,
  fileName: string,
  session: InferenceSession,
  imgsz: number,
  opts: { onProgress: (done: number, total: number, etaMs: number | null) => void; signal: AbortSignal },
): Promise<PoseRun> {
  const { rotation, frameCount, fps } = video.info;
  const preprocessor = new FramePreprocessor(imgsz, rotation);
  const frames: Person[][] = [];
  const thumbnails: ImageBitmap[] = [];
  const thumbStride = thumbnailStride(frameCount);
  let size = { width: 0, height: 0 };
  let inferMs = 0;
  const started = performance.now();
  try {
    for await (const frame of decodeFrames(video)) {
      try {
        opts.signal.throwIfAborted();
        if (frames.length === 0) size = displaySize(frame, rotation);
        const { tensor, letterbox } = preprocessor.toTensor(frame);
        const t0 = performance.now();
        const output = await runOrt(session, tensor, letterbox.inputWidth, letterbox.inputHeight);
        inferMs += performance.now() - t0;
        if (frames.length % thumbStride === 0) thumbnails.push(makeThumbnail(frame, rotation));
        frames.push(decodePeople(output, letterbox, CONF_THRESHOLD));
      } finally {
        frame.close();
      }
      opts.onProgress(frames.length, frameCount, estimateRemainingMs(performance.now() - started, frames.length, frameCount));
    }
  } catch (error) {
    thumbnails.forEach((t) => t.close());
    throw error;
  }
  return {
    fileName,
    fps,
    width: size.width,
    height: size.height,
    frames,
    thumbnails,
    thumbStride,
    msPerFrame: frames.length > 0 ? inferMs / frames.length : 0,
  };
}
