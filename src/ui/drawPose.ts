/**
 * 指定画面用: 縮小画像（あれば）の上に、そのコマの骨格を描く。
 * 縮小画像が無い（保存したファイルを読み込んだ）ときは、全コマの骨格が収まるように描く。
 */

import { SKELETON_EDGES } from '../analysis/payload';
import type { PoseJsonInput } from '../analysis/types';

type Frame = PoseJsonInput['frames'][number];

function keypointBounds(frames: readonly Frame[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  frames.forEach((f) =>
    Object.values(f.keypoints).forEach(([x, y]) => {
      if (x === null || y === null) return;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }),
  );
  const pad = Math.max(maxX - minX, maxY - minY) * 0.1 + 10;
  return { minX: minX - pad, minY: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
}

interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly toCanvas: (x: number, y: number) => readonly [number, number];
}

/** 映像（または骨格の範囲）を、縦横比を保ったまま中央に置く。画像と骨格は必ずこの同じ配置で描く */
export function fitLayout(box: Box, canvasWidth: number, maxHeight: number): Layout {
  const height = Math.min((canvasWidth * box.height) / box.width, maxHeight);
  const scale = Math.min(canvasWidth / box.width, height / box.height);
  const offsetX = (canvasWidth - box.width * scale) / 2;
  const offsetY = (height - box.height * scale) / 2;
  return {
    width: canvasWidth,
    height,
    scale,
    offsetX,
    offsetY,
    toCanvas: (x, y) => [offsetX + (x - box.minX) * scale, offsetY + (y - box.minY) * scale],
  };
}

const MAX_HEIGHT = 480;

export function drawPoseFrame(
  canvas: HTMLCanvasElement,
  frames: readonly Frame[],
  position: number,
  thumb: ImageBitmap | null,
  size: { width: number; height: number } | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const box: Box = thumb && size ? { minX: 0, minY: 0, width: size.width, height: size.height } : keypointBounds(frames);
  const layout = fitLayout(box, canvas.clientWidth || 320, MAX_HEIGHT);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = layout.width * ratio;
  canvas.height = layout.height * ratio;
  canvas.style.height = `${layout.height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#0A1013';
  ctx.fillRect(0, 0, layout.width, layout.height);
  if (thumb && size) {
    ctx.drawImage(thumb, layout.offsetX, layout.offsetY, box.width * layout.scale, box.height * layout.scale);
  }
  const k = frames[position]?.keypoints ?? {};
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 3;
  SKELETON_EDGES.forEach(([a, b]) => {
    const p = k[a];
    const q = k[b];
    if (!p || !q || p[0] === null || p[1] === null || q[0] === null || q[1] === null) return;
    const [x1, y1] = layout.toCanvas(p[0], p[1]);
    const [x2, y2] = layout.toCanvas(q[0], q[1]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
}
