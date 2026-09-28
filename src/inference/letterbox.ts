/**
 * YOLO 入力用のレターボックス計算。
 * ultralytics の rect 推論（長辺を imgsz に合わせ、短辺を stride の倍数までパディング・中央寄せ）と同じ規則。
 * Python 側（scratchpad/export/reference.py の letterbox）で .pt と完全一致を確認済み。
 */

export const PAD_VALUE = 114;
const STRIDE = 32;

export interface Letterbox {
  readonly scale: number;
  readonly newWidth: number;
  readonly newHeight: number;
  readonly padLeft: number;
  readonly padTop: number;
  readonly inputWidth: number;
  readonly inputHeight: number;
}

export function computeLetterbox(srcWidth: number, srcHeight: number, imgsz: number): Letterbox {
  if (srcWidth <= 0 || srcHeight <= 0 || imgsz <= 0) {
    throw new Error(`レターボックスの入力が不正です: ${srcWidth}x${srcHeight}, imgsz=${imgsz}`);
  }
  const scale = imgsz / Math.max(srcWidth, srcHeight);
  const newWidth = Math.round(srcWidth * scale);
  const newHeight = Math.round(srcHeight * scale);
  const padWidth = (STRIDE - (newWidth % STRIDE)) % STRIDE;
  const padHeight = (STRIDE - (newHeight % STRIDE)) % STRIDE;
  return {
    scale,
    newWidth,
    newHeight,
    padLeft: Math.floor(padWidth / 2),
    padTop: Math.floor(padHeight / 2),
    inputWidth: newWidth + padWidth,
    inputHeight: newHeight + padHeight,
  };
}

/** RGBA（canvas の ImageData）を YOLO 入力の CHW / 0-1 の Float32 に並べ替える。 */
export function rgbaToChw(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const plane = width * height;
  if (rgba.length !== plane * 4) {
    throw new Error(`画素数が一致しません: ${rgba.length} != ${plane * 4}`);
  }
  const out = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    out[i] = rgba[p] / 255;
    out[plane + i] = rgba[p + 1] / 255;
    out[2 * plane + i] = rgba[p + 2] / 255;
  }
  return out;
}

/** 入力座標（レターボックス後）を元フレーム座標に戻す。 */
export function toSourceX(x: number, lb: Letterbox): number {
  return (x - lb.padLeft) / lb.scale;
}

export function toSourceY(y: number, lb: Letterbox): number {
  return (y - lb.padTop) / lb.scale;
}
