/**
 * 縮小画像に、フィットした軌跡の線・検出した点（誤検出かどうかで分けず、すべて同じ印）・今のコマの検出（黄色の輪）を重ねる。
 */

import type { ThrowAnalysis } from '../capDetect/analyzeThrow';

export interface TrajectoryOverlay {
  /** 表示座標 → 縮小画像の画素 */
  readonly scale: number;
  readonly analysis: ThrowAnalysis;
  readonly currentFrame: number;
}

const COLOR = { line: '#22d3ee', point: '#f472b6', current: '#facc15' } as const;
const R = 3;

function dot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = COLOR.point;
  ctx.fill();
}

function polyline(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[]): void {
  if (points.length < 2) return;
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.lineWidth = 1;
}

export function drawTrajectoryFrame(canvas: HTMLCanvasElement, image: ImageBitmap, overlay: TrajectoryOverlay): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);
  const { scale: s, analysis: a } = overlay;
  polyline(ctx, a.trajectory.map((p) => [p.x * s, p.y * s] as const));
  a.detections.forEach((d) => {
    const [x, y] = [d.x * s, d.y * s];
    dot(ctx, x, y);
    if (d.frame === overlay.currentFrame) {
      ctx.beginPath();
      ctx.arc(x, y, R * 3, 0, Math.PI * 2);
      ctx.strokeStyle = COLOR.current;
      ctx.stroke();
    }
  });
}
