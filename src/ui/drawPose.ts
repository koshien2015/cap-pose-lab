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

export function drawPoseFrame(
  canvas: HTMLCanvasElement,
  frames: readonly Frame[],
  position: number,
  thumb: ImageBitmap | null,
  size: { width: number; height: number } | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const box = thumb && size ? { minX: 0, minY: 0, width: size.width, height: size.height } : keypointBounds(frames);
  const width = canvas.clientWidth || 320;
  const height = Math.min((width * box.height) / box.width, 480);
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = '#0A1013';
  ctx.fillRect(0, 0, width, height);
  if (thumb && size) ctx.drawImage(thumb, 0, 0, width, height);
  const scale = Math.min(width / box.width, height / box.height);
  const to = (x: number, y: number) => [(x - box.minX) * scale, (y - box.minY) * scale] as const;
  const k = frames[position]?.keypoints ?? {};
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 3;
  SKELETON_EDGES.forEach(([a, b]) => {
    const p = k[a];
    const q = k[b];
    if (!p || !q || p[0] === null || p[1] === null || q[0] === null || q[1] === null) return;
    const [x1, y1] = to(p[0], p[1]);
    const [x2, y2] = to(q[0], q[1]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
}
