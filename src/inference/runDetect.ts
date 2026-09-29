/**
 * 1本の動画でキャップを検出する（ブラウザ依存の薄い層。段取りは capDetect/detectLoop.ts）。
 * フレームは1枚ずつ RGBA（レターボックス済み）と縮小画像にして、その場で閉じる。VideoFrame は持たない
 * （decodeFrames はデコーダへの投入を絞っているので、閉じずに持つとデコードが止まる）。
 */

import type { InferenceSession } from 'onnxruntime-web';

import { decodeDetections } from '../capDetect/decodeDetect';
import { type FrameImage, type LoopFrame, type RgbaInput, runDetectLoop, withEnhancement } from '../capDetect/detectLoop';
import { classIds, type FrameRecord, toFrameRecord } from '../capDetect/records';
import { estimateRemainingMs } from './eta';
import { displaySize, FramePreprocessor, makeThumbnail } from './frameCanvas';
import { type Letterbox, rgbaToChw } from './letterbox';
import type { CapDetector } from './manifest';
import { runPose as runModel } from './ortSession';
import { decodeFrames, type DemuxedVideo, type VideoInfo } from './videoSource';

export interface DetectRun {
  readonly fileName: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly records: readonly FrameRecord[];
  /** 推論したコマの縮小画像（frame 順） */
  readonly images: readonly FrameImage<ImageBitmap>[];
  readonly msPerInference: number;
}

interface DetectInput extends RgbaInput {
  readonly letterbox: Letterbox;
}

type Size = { width: number; height: number };

function prepareOne(frame: VideoFrame, index: number, pre: FramePreprocessor, rotation: VideoInfo['rotation']): LoopFrame<DetectInput, ImageBitmap> {
  try {
    const { rgba, letterbox: lb } = pre.toRgba(frame);
    const content = { x: lb.padLeft, y: lb.padTop, width: lb.newWidth, height: lb.newHeight };
    return { index, input: { rgba, width: lb.inputWidth, height: lb.inputHeight, content, letterbox: lb }, image: makeThumbnail(frame, rotation) };
  } finally {
    frame.close();
  }
}

async function* prepareFrames(
  video: DemuxedVideo,
  pre: FramePreprocessor,
  onDecoded: (done: number, size: Size) => void,
): AsyncGenerator<LoopFrame<DetectInput, ImageBitmap>> {
  const { rotation } = video.info;
  let index = 0;
  for await (const frame of decodeFrames(video)) {
    const size = displaySize(frame, rotation);
    const prepared = prepareOne(frame, index, pre, rotation);
    index += 1;
    onDecoded(index, size);
    yield prepared;
  }
}

export async function analyzeDetectVideo(
  video: DemuxedVideo,
  fileName: string,
  session: InferenceSession,
  detector: CapDetector,
  opts: { onProgress: (done: number, total: number, etaMs: number | null) => void; signal: AbortSignal },
): Promise<DetectRun> {
  const { frameCount, fps, rotation } = video.info;
  const ids = classIds(detector.classes);
  const started = performance.now();
  let size: Size = { width: 0, height: 0 };
  let inferMs = 0;
  let inferCount = 0;
  const source = prepareFrames(video, new FramePreprocessor(detector.imgsz, rotation), (done, shown) => {
    size = shown;
    opts.onProgress(done, frameCount, estimateRemainingMs(performance.now() - started, done, frameCount));
  });
  const close = (b: ImageBitmap) => b.close();
  const frames = detector.preprocess === 'enhanced' ? withEnhancement(source, close) : source;
  const detect = async (frame: number, input: DetectInput) => {
    const t0 = performance.now();
    const output = await runModel(session, rgbaToChw(input.rgba, input.width, input.height), input.width, input.height);
    inferMs += performance.now() - t0;
    inferCount += 1;
    return toFrameRecord(frame, decodeDetections(output, detector.classes.length, input.letterbox), ids);
  };
  const { records, images } = await runDetectLoop(frames, { detect, disposeImage: close, signal: opts.signal });
  return { fileName, fps, ...size, frameCount, records, images, msPerInference: inferCount > 0 ? inferMs / inferCount : 0 };
}
