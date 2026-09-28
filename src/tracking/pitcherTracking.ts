/**
 * 投手の特定と追跡。
 * 姿勢推定は人物を N 人返すだけなので、1フレームで投手を決め（自動 or タップ）、
 * 以降は bbox の重なり（IoU）で前後のフレームへたどる。
 * 見失ったフレームは null にする（別人を拾ったり、値を作って埋めたりしない）。
 */

import type { Person } from '../inference/decodePose';

type Box = readonly [number, number, number, number];

export interface Anchor {
  readonly frame: number;
  readonly index: number;
}

export const DEFAULT_MIN_IOU = 0.2;

const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

export function findInitialPitcher(frames: readonly (readonly Person[])[]): Anchor | null {
  const frame = frames.findIndex((people) => people.length > 0);
  if (frame < 0) return null;
  const people = frames[frame];
  const index = people.reduce((best, p, i) => (area(p.box) > area(people[best].box) ? i : best), 0);
  return { frame, index };
}

export function personAtPoint(people: readonly Person[], x: number, y: number): number | null {
  const hits = people
    .map((p, i) => ({ i, a: area(p.box), inside: x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3] }))
    .filter((h) => h.inside)
    .sort((m, n) => m.a - n.a);
  return hits.length > 0 ? hits[0].i : null;
}

function bestMatch(people: readonly Person[], last: Box, minIou: number): Person | null {
  const scored = people.map((p) => ({ p, overlap: iou(last, p.box) })).filter((s) => s.overlap >= minIou);
  if (scored.length === 0) return null;
  return scored.reduce((m, s) => (s.overlap > m.overlap ? s : m)).p;
}

function follow(
  frames: readonly (readonly Person[])[],
  order: readonly number[],
  start: Person,
  minIou: number,
): Map<number, Person | null> {
  const out = new Map<number, Person | null>();
  let last: Box = start.box;
  for (const i of order) {
    const found = bestMatch(frames[i], last, minIou);
    out.set(i, found);
    if (found) last = found.box;
  }
  return out;
}

export function trackPitcher(
  frames: readonly (readonly Person[])[],
  anchor: Anchor,
  minIou: number = DEFAULT_MIN_IOU,
): (Person | null)[] {
  const start = frames[anchor.frame]?.[anchor.index];
  if (!start) throw new Error(`アンカーが範囲外です: frame=${anchor.frame}, index=${anchor.index}`);
  const forward = Array.from({ length: frames.length - anchor.frame - 1 }, (_, k) => anchor.frame + 1 + k);
  const backward = Array.from({ length: anchor.frame }, (_, k) => anchor.frame - 1 - k);
  const found = new Map([...follow(frames, forward, start, minIou), ...follow(frames, backward, start, minIou)]);
  return frames.map((_, i) => (i === anchor.frame ? start : (found.get(i) ?? null)));
}
