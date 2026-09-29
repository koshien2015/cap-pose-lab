/**
 * 比較ビューアの canvas 描画（viewer_template.py の描画部分の移植）。色・線幅・矢印の上限も同じ。
 */

import type { ViewerPayload, XY } from '../analysis/payload';
import { type Bounds, frameAt, indexFor, pitchCursor, sequence, targetNames, vectorAt, type ViewState } from './viewerMath';

export const COLORS = ['#BFE9F2', '#FFB23E'] as const;
/** ベクトルは骨格と見分けやすいよう、色相を最も離した色にする */
export const VECTOR_COLORS = ['#FF3B30', '#00E676'] as const;
/** 矢印の最大長（身体サイズ単位） */
const MAX_ARROW_LENGTH = 1.2;

interface Projector {
  readonly scale: number;
  readonly to: (p: XY) => XY;
}

export function projector(canvas: HTMLCanvasElement, b: Bounds): Projector {
  const scale = Math.min(canvas.width / (b.maxX - b.minX), canvas.height / (b.maxY - b.minY));
  const offsetX = (canvas.width - (b.maxX - b.minX) * scale) / 2;
  const offsetY = (canvas.height - (b.maxY - b.minY) * scale) / 2;
  return {
    scale,
    to: ([x, y]) => [offsetX + (x - b.minX) * scale, canvas.height - offsetY - (y - b.minY) * scale],
  };
}

function drawStickFigure(ctx: CanvasRenderingContext2D, p: Projector, k: Readonly<Record<string, XY>>, edges: ViewerPayload['edges'], color: string, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, p.scale * 0.018);
  ctx.lineCap = 'round';
  edges.forEach(([a, b]) => {
    if (!k[a] || !k[b]) return;
    const [x1, y1] = p.to(k[a]);
    const [x2, y2] = p.to(k[b]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
  ctx.fillStyle = color;
  Object.values(k).forEach((point) => {
    const [x, y] = p.to(point);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, p.scale * 0.012), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawTrail(ctx: CanvasRenderingContext2D, p: Projector, payload: ViewerPayload, index: number, cursor: number, s: ViewState, color: string) {
  const pitch = payload.pitches[index];
  const list = sequence(pitch, s);
  const at = indexFor(pitch, cursor, s);
  if (at === null) return;
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const names = pitch.trail_joints ?? [`${pitch.throwing_side}_wrist`, `${pitch.throwing_side}_elbow`];
  names.forEach((name) => {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= Math.min(at, list.length - 1); i += 1) {
      const point = list[i]?.k[name];
      if (!point) {
        started = false;
        continue;
      }
      const [x, y] = p.to(point);
      if (started) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        started = true;
      }
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawArrow(ctx: CanvasRenderingContext2D, from: XY, to: XY, color: string, clipped: boolean) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 2) return;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.min(14, length * 0.4);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
  if (clipped) {
    // 打ち切った矢印は先端を白く縁取り、「実際より短く描いている」と示す
    ctx.strokeStyle = '#E8EFF2';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export interface SceneOptions {
  readonly payload: ViewerPayload;
  readonly pitchIndexes: readonly number[];
  readonly cursor: number;
  readonly state: ViewState;
  readonly bounds: Bounds;
  readonly arrowScale: number;
  readonly reference: number;
  readonly joints: readonly string[];
  readonly trail: boolean;
}

export function drawScene(canvas: HTMLCanvasElement, o: SceneOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const p = projector(canvas, o.bounds);
  // 原点（股関節中点）の高さに床線を引くと、上下の比較がしやすい
  ctx.strokeStyle = '#2A3A42';
  ctx.lineWidth = 1;
  const [, baseline] = p.to([0, 0]);
  ctx.beginPath();
  ctx.moveTo(0, baseline);
  ctx.lineTo(canvas.width, baseline);
  ctx.stroke();

  o.pitchIndexes.forEach((index) => {
    const pitch = o.payload.pitches[index];
    const cursor = pitchCursor(o.cursor, index, o.state);
    const frame = frameAt(pitch, cursor, o.state);
    if (!frame) return;
    if (o.trail) drawTrail(ctx, p, o.payload, index, cursor, o.state, COLORS[index]);
    drawStickFigure(ctx, p, frame.k, o.payload.edges, COLORS[index], o.pitchIndexes.length > 1 ? 0.85 : 1);
    if (o.state.vector === 'none') return;
    // 代表値が身体長 0.5 になるようそろえてから、倍率を掛ける
    const gain = (o.arrowScale * 0.5) / o.reference;
    targetNames(pitch, o.state, o.joints).forEach((name) => {
      const point = frame.k[name];
      const v = vectorAt(pitch, cursor, name, o.state);
      if (!point || !v) return;
      let dx = v[0] * gain;
      let dy = v[1] * gain;
      const length = Math.hypot(dx, dy);
      const clipped = length > MAX_ARROW_LENGTH;
      if (clipped) {
        dx *= MAX_ARROW_LENGTH / length;
        dy *= MAX_ARROW_LENGTH / length;
      }
      drawArrow(ctx, p.to(point), p.to([point[0] + dx, point[1] + dy]), VECTOR_COLORS[index], clipped);
    });
  });
}
