/**
 * 角度・距離の基礎計算（pitching/metrics/geometry.py の移植）。
 * 画像座標は Y 軸が下向きなので、「上向き」を扱う関数はここで符号を反転する。
 * 打者方向は facingSign で渡す（打者が画像の右なら +1、左なら -1）。
 */

export type Point = readonly [number, number];

const MIN_VECTOR_NORM = 1e-6;

const valid = (p: Point | null): p is Point => p !== null && Number.isFinite(p[0]) && Number.isFinite(p[1]);

export function facingSign(direction: 'left' | 'right'): 1 | -1 {
  return direction === 'right' ? 1 : -1;
}

export function distance(a: Point | null, b: Point | null): number | null {
  if (!valid(a) || !valid(b)) return null;
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function midpoint(a: Point | null, b: Point | null): Point | null {
  if (!valid(a) || !valid(b)) return null;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** 点 b を頂点とする、b→a と b→c のなす角（0〜180度）。 */
export function jointAngle(a: Point | null, b: Point | null, c: Point | null): number | null {
  if (!valid(a) || !valid(b) || !valid(c)) return null;
  const va = [a[0] - b[0], a[1] - b[1]];
  const vc = [c[0] - b[0], c[1] - b[1]];
  const na = Math.hypot(va[0], va[1]);
  const nc = Math.hypot(vc[0], vc[1]);
  if (na < MIN_VECTOR_NORM || nc < MIN_VECTOR_NORM) return null;
  const cosine = Math.max(-1, Math.min(1, (va[0] * vc[0] + va[1] * vc[1]) / (na * nc)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/** origin→target が打者方向の水平線と成す角（+90 が真上、0 が打者方向、負は下向き）。 */
export function directionAngle(origin: Point | null, target: Point | null, sign: number): number | null {
  if (!valid(origin) || !valid(target)) return null;
  const forward = (target[0] - origin[0]) * sign;
  const upward = -(target[1] - origin[1]);
  if (Math.hypot(forward, upward) < MIN_VECTOR_NORM) return null;
  return (Math.atan2(upward, forward) * 180) / Math.PI;
}

/** 時間微分（np.gradient と同じ。端は片側差分、NaN は伝播）。 */
export function gradient(values: readonly number[], fps: number): number[] {
  const n = values.length;
  if (n < 2 || !(fps > 0)) return values.map(() => Number.NaN);
  const h = 1 / fps;
  return values.map((_, i) => {
    if (i === 0) return (values[1] - values[0]) / h;
    if (i === n - 1) return (values[n - 1] - values[n - 2]) / h;
    return (values[i + 1] - values[i - 1]) / (2 * h);
  });
}
