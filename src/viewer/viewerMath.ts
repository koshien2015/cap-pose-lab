/**
 * 比較ビューアの計算部分（pitching/visualization/viewer_template.py の JS の移植）。
 * 元の JS は画面部品（ui.*）を直接読んでいたが、ここでは表示状態を ViewState で受ける純粋関数にした。
 *
 * 座標は「身体サイズを1」とした値で、X は打者方向が正、Y は上が正。
 */

import type { ViewerFrame, ViewerPayload, ViewerPitch, XY } from '../analysis/payload';

export type SyncMode = 'progress' | 'release' | 'frame';
export type VectorMode = 'none' | 'velocity' | 'accel';

export interface ViewState {
  readonly sync: SyncMode;
  readonly vector: VectorMode;
  /** '__all__'（全関節）/ '__arm__'（投球腕）/ 関節名 */
  readonly target: string;
}

/** 実フレーム（f あり）か、進行率で並べ直したコマ（f なし） */
export type Frameish = Pick<ViewerFrame, 'k'> & { readonly f?: number };

export function defaultSync(payload: ViewerPayload): SyncMode {
  return payload.pitches.some((p) => !p.normalized) ? 'release' : 'progress';
}

export function jointNames(payload: ViewerPayload): string[] {
  const names = new Set<string>();
  payload.pitches.forEach((p) => p.frames.forEach((f) => Object.keys(f.k).forEach((n) => names.add(n))));
  return [...names].sort();
}

export function sequence(pitch: ViewerPitch, s: ViewState): readonly Frameish[] {
  return s.sync === 'progress' && pitch.normalized ? pitch.normalized : pitch.frames;
}

export function anchorIndex(pitch: ViewerPitch): number {
  const frame = pitch.events.release?.frame;
  if (frame === null || frame === undefined) return 0;
  const index = pitch.frames.findIndex((f) => f.f === frame);
  return index < 0 ? 0 : index;
}

export function cursorRange(payload: ViewerPayload, s: ViewState): { min: number; max: number } {
  if (s.sync === 'progress') return { min: 0, max: payload.normalized_samples - 1 };
  if (s.sync === 'release') {
    let before = 0;
    let after = 0;
    payload.pitches.forEach((p) => {
      const anchor = anchorIndex(p);
      before = Math.max(before, anchor);
      after = Math.max(after, p.frames.length - 1 - anchor);
    });
    return { min: -before, max: after };
  }
  return { min: 0, max: Math.max(...payload.pitches.map((p) => p.frames.length)) - 1 };
}

export function indexFor(pitch: ViewerPitch, cursor: number, s: ViewState): number | null {
  if (s.sync === 'progress') return pitch.normalized ? cursor : null;
  if (s.sync === 'release') return anchorIndex(pitch) + cursor;
  return cursor;
}

export function frameAt(pitch: ViewerPitch, cursor: number, s: ViewState): Frameish | null {
  const index = indexFor(pitch, cursor, s);
  const list = sequence(pitch, s);
  if (index === null || index < 0 || index >= list.length) return null;
  return list[index];
}

/** 進行率モードでは実フレームが無いので、進行率が最も近い実フレームを探す */
export function realIndex(pitch: ViewerPitch, cursor: number, s: ViewState): number | null {
  const index = indexFor(pitch, cursor, s);
  if (index === null) return null;
  if (s.sync !== 'progress') return index >= 0 && index < pitch.frames.length ? index : null;
  const wanted = pitch.normalized?.[index]?.p;
  if (wanted === undefined) return null;
  let best: number | null = null;
  let bestGap = Infinity;
  pitch.frames.forEach((f, i) => {
    if (f.p === null) return;
    const gap = Math.abs(f.p - wanted);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return best;
}

/**
 * 速度は2フレーム差、加速度は3フレームの2階差分（向きが力の向きに当たる）。
 * 質量が分からないので大きさは「身体長/秒（²）」の相対値。進行率モードでは 1% きざみあたり。
 */
export function vectorAt(pitch: ViewerPitch, cursor: number, name: string, s: ViewState): XY | null {
  if (s.vector === 'none') return null;
  const list = sequence(pitch, s);
  const index = indexFor(pitch, cursor, s);
  if (index === null) return null;
  const point = (i: number): XY | null => list[i]?.k[name] ?? null;
  const step = s.sync === 'progress' ? 1 : pitch.fps;
  if (s.vector === 'velocity') {
    const here = point(index);
    const next = point(index + 1);
    if (!here || !next) return null;
    return [(next[0] - here[0]) * step, (next[1] - here[1]) * step];
  }
  const prev = point(index - 1);
  const here = point(index);
  const next = point(index + 1);
  if (!prev || !here || !next) return null;
  return [(next[0] - 2 * here[0] + prev[0]) * step * step, (next[1] - 2 * here[1] + prev[1]) * step * step];
}

/** 矢印の基準になる大きさ（全フレーム・全関節の上位10%）。重いので呼び出し側で覚えておく */
export function referenceMagnitude(payload: ViewerPayload, s: ViewState): number {
  const joints = jointNames(payload);
  const range = cursorRange(payload, s);
  const magnitudes: number[] = [];
  payload.pitches.forEach((pitch) => {
    for (let cursor = range.min; cursor <= range.max; cursor += 1) {
      joints.forEach((name) => {
        const v = vectorAt(pitch, cursor, name, s);
        if (v) magnitudes.push(Math.hypot(v[0], v[1]));
      });
    }
  });
  magnitudes.sort((a, b) => a - b);
  const reference = magnitudes.length
    ? magnitudes[Math.floor(magnitudes.length * 0.9)] || magnitudes[magnitudes.length - 1]
    : 1;
  return reference || 1;
}

export function targetNames(pitch: ViewerPitch, s: ViewState, joints: readonly string[]): readonly string[] {
  if (s.target === '__all__') return joints;
  if (s.target === '__arm__') {
    const side = pitch.throwing_side;
    return [`${side}_shoulder`, `${side}_elbow`, `${side}_wrist`];
  }
  return [s.target];
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export function bounds(payload: ViewerPayload): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  payload.pitches.forEach((p) =>
    p.frames.forEach((f) =>
      Object.values(f.k).forEach(([x, y]) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }),
    ),
  );
  const padX = (maxX - minX) * 0.15 + 0.2;
  const padY = (maxY - minY) * 0.15 + 0.2;
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

/** イベントの目盛りを置くカーソル位置 */
export function cursorOfFrame(pitch: ViewerPitch, frame: number, s: ViewState, samples: number): number | null {
  const index = pitch.frames.findIndex((f) => f.f === frame);
  if (index < 0) return null;
  if (s.sync === 'release') return index - anchorIndex(pitch);
  if (s.sync === 'frame') return index;
  const progress = pitch.frames[index].p;
  if (progress === null || !pitch.normalized) return null;
  return Math.round((progress / 100) * (samples - 1));
}

const missing = (v: number | null | undefined): v is null | undefined => v === null || v === undefined || Number.isNaN(v);

export function formatNumber(value: number | null | undefined, digits = 1): string {
  return missing(value) ? '—' : value.toFixed(digits);
}

/** 桁違いになる量（速度・加速度）は有効数字3桁 */
export function formatMagnitude(value: number | null | undefined): string {
  if (missing(value)) return '—';
  if (value === 0) return '0';
  const digits = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(value))));
  return value.toFixed(Math.min(6, digits));
}

export function diffText(values: readonly (number | null)[], format: (v: number) => string = (v) => v.toFixed(1)): string {
  if (values.length < 2 || values[0] === null || values[1] === null) return '';
  const difference = values[0] - values[1];
  return (difference > 0 ? '+' : '') + format(difference);
}
