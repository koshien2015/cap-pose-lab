/**
 * VideoFrame を回転込みで canvas に描き、YOLO 入力テンソルやプレビュー用の縮小画像を作る。
 */

import { computeLetterbox, type Letterbox, PAD_VALUE, rgbaToChw } from './letterbox';
import type { VideoInfo } from './videoSource';

type Rotation = VideoInfo['rotation'];

/** 縮小画像の長辺(px)。縦動画でも横動画でも1枚あたり 320x180 相当に収める */
export const THUMB_LONG_EDGE = 320;
/** 1本あたりに残す縮小画像の上限。320x180x4 バイト x 300 枚 ≒ 69MB */
export const MAX_THUMBNAILS = 300;

export function displaySize(
  frame: { displayWidth: number; displayHeight: number },
  rotation: Rotation,
): { width: number; height: number } {
  const swap = rotation === 90 || rotation === 270;
  return swap
    ? { width: frame.displayHeight, height: frame.displayWidth }
    : { width: frame.displayWidth, height: frame.displayHeight };
}

export function thumbnailSize(
  width: number,
  height: number,
  longEdge: number = THUMB_LONG_EDGE,
): { width: number; height: number } {
  const scale = longEdge / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** 何コマおきに縮小画像を残すか（1 = 全コマ） */
export function thumbnailStride(frameCount: number, maxThumbnails: number = MAX_THUMBNAILS): number {
  return Math.max(1, Math.ceil(frameCount / maxThumbnails));
}

function drawRotated(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: VideoFrame,
  rotation: Rotation,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const swap = rotation === 90 || rotation === 270;
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const w = swap ? height : width;
  const h = swap ? width : height;
  ctx.drawImage(frame, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function context2d(canvas: OffscreenCanvas, willReadFrequently: boolean): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently });
  if (!ctx) throw new Error('canvas 2D コンテキストを取得できません');
  return ctx;
}

export class FramePreprocessor {
  private readonly imgsz: number;
  private readonly rotation: Rotation;
  private canvas: OffscreenCanvas | null = null;
  private letterbox: Letterbox | null = null;

  constructor(imgsz: number, rotation: Rotation) {
    this.imgsz = imgsz;
    this.rotation = rotation;
  }

  toTensor(frame: VideoFrame): { tensor: Float32Array; letterbox: Letterbox } {
    const { width, height } = displaySize(frame, this.rotation);
    if (!this.letterbox || !this.canvas) {
      this.letterbox = computeLetterbox(width, height, this.imgsz);
      this.canvas = new OffscreenCanvas(this.letterbox.inputWidth, this.letterbox.inputHeight);
    }
    const lb = this.letterbox;
    const ctx = context2d(this.canvas, true);
    ctx.fillStyle = `rgb(${PAD_VALUE},${PAD_VALUE},${PAD_VALUE})`;
    ctx.fillRect(0, 0, lb.inputWidth, lb.inputHeight);
    drawRotated(ctx, frame, this.rotation, lb.padLeft, lb.padTop, lb.newWidth, lb.newHeight);
    const image = ctx.getImageData(0, 0, lb.inputWidth, lb.inputHeight);
    return { tensor: rgbaToChw(image.data, lb.inputWidth, lb.inputHeight), letterbox: lb };
  }
}

export function makeThumbnail(frame: VideoFrame, rotation: Rotation): ImageBitmap {
  const shown = displaySize(frame, rotation);
  const size = thumbnailSize(shown.width, shown.height);
  const canvas = new OffscreenCanvas(size.width, size.height);
  drawRotated(context2d(canvas, false), frame, rotation, 0, 0, size.width, size.height);
  return canvas.transferToImageBitmap();
}
