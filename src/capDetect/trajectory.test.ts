import { describe, expect, it } from 'vitest';

import { expectClose } from '../analysis/fixtures';
import { loadCapFixture } from './fixtures';
import {
  type Coeffs,
  estimateSpeedKmh,
  evaluate,
  FitError,
  fitQuadratic,
  interpolateGaps,
  positionAt,
  ransacFit,
  type TrajectoryPoint,
} from './trajectory';

interface TrajectoryFixture {
  readonly fit: {
    readonly fps: number;
    readonly threshold: number;
    readonly points: TrajectoryPoint[];
    readonly coeffs_x: number[];
    readonly coeffs_y: number[];
    readonly rmse: number;
    readonly end_position: number[];
    readonly completed: TrajectoryPoint[];
    readonly speed_kmh: number;
  };
  readonly fit_quadratic: { readonly ts: number[]; readonly vs: number[]; readonly coeffs: number[] }[];
}

const fx = loadCapFixture<TrajectoryFixture>('trajectory');
const TRUTH_X: Coeffs = [900, 300, -50];
const TRUTH_Y: Coeffs = [400, 200, 600];
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

/** 真の放物線上の点（jitter で各点をずらせる） */
function parabola(frames: readonly number[], jitter: (i: number) => [number, number] = () => [0, 0], fps = 60): TrajectoryPoint[] {
  return frames.map((frame, i) => {
    const t = frame / fps;
    const [dx, dy] = jitter(i);
    return { frame, t, x: evaluate(TRUTH_X, t) + dx, y: evaluate(TRUTH_Y, t) + dy };
  });
}

const stripFlag = (points: readonly TrajectoryPoint[]) => points.map(({ frame, t, x, y }) => ({ frame, t, x, y }));

describe('Python 版との数値一致', () => {
  it('fitQuadratic', () => {
    fx.fit_quadratic.forEach((c) => expectClose([...fitQuadratic(c.ts, c.vs)], c.coeffs, 1e-4));
  });

  it('外れ値の無い軌跡: 係数・残差・終点・補間・球速', () => {
    const fit = ransacFit(fx.fit.points, fx.fit.threshold);
    expect(fit.outliers).toEqual([]);
    expectClose([...fit.coeffsX], fx.fit.coeffs_x, 1e-4);
    expectClose([...fit.coeffsY], fx.fit.coeffs_y, 1e-4);
    expectClose(fit.rmse, fx.fit.rmse, 1e-6);
    const tEnd = Math.max(...fit.inliers.map((p) => p.t));
    expectClose(positionAt(fit, tEnd), fx.fit.end_position, 1e-4);
    expectClose(stripFlag(interpolateGaps(fit, fx.fit.fps)), fx.fit.completed, 1e-4);
    expectClose(estimateSpeedKmh(fit), fx.fit.speed_kmh, 1e-9);
  });
});

describe('ransacFit', () => {
  it('きれいなデータから係数を取り戻す', () => {
    const fit = ransacFit(parabola(range(0, 20)), 16);
    fit.coeffsX.forEach((c, i) => expect(c).toBeCloseTo(TRUTH_X[i], 6));
    fit.coeffsY.forEach((c, i) => expect(c).toBeCloseTo(TRUTH_Y[i], 6));
    expect(fit.rmse).toBeCloseTo(0, 6);
  });

  it('まばらで揺れのあるデータでも当てはまる', () => {
    const points = parabola(range(0, 30).filter((f) => f % 3 === 0), (i) => (i % 2 === 0 ? [2, -2] : [-2, 2]));
    const fit = ransacFit(points, 16);
    expect(fit.outliers).toEqual([]);
    points.forEach((p) => {
      const [x, y] = positionAt(fit, p.t);
      expect(Math.hypot(x - evaluate(TRUTH_X, p.t), y - evaluate(TRUTH_Y, p.t))).toBeLessThan(3);
    });
  });

  it('3割の外れ値を除く', () => {
    const wrong = new Set([2, 5, 8, 11, 14, 17]);
    const points = parabola(range(0, 20), (i) => (wrong.has(i) ? [200, -150] : [0, 0]));
    const fit = ransacFit(points, 16);
    expect(fit.outliers.map((p) => p.frame).sort((a, b) => a - b)).toEqual([...wrong]);
    fit.coeffsY.forEach((c, i) => expect(c).toBeCloseTo(TRUTH_Y[i], 6));
  });

  it('5点未満は理由つきで例外にする', () => {
    expect(() => ransacFit(parabola(range(0, 4)), 16)).toThrow(FitError);
    expect(() => ransacFit(parabola(range(0, 4)), 16)).toThrow('最低5点');
  });

  it('全点が同じ時刻なら例外にする', () => {
    const same = range(0, 6).map((i) => ({ frame: i, t: 0.1, x: i, y: i }));
    expect(() => ransacFit(same, 16)).toThrow('同一時刻');
  });

  it('どの3点で当てても5点以上が乗らなければ例外にする', () => {
    const scattered = range(0, 6).map((i) => ({ frame: i, t: i / 60, x: (i % 2) * 500, y: (i % 3) * 400 }));
    expect(() => ransacFit(scattered, 1)).toThrow('軌跡に乗る点');
  });

  it('同じシードなら同じ結果になる', () => {
    const wrong = new Set([1, 4, 9]);
    const points = parabola(range(0, 15), (i) => (wrong.has(i) ? [90, 90] : [0, 0]));
    expect(ransacFit(points, 16, { seed: 3 })).toEqual(ransacFit(points, 16, { seed: 3 }));
  });
});

describe('interpolateGaps', () => {
  it('インライアの間の欠けたコマを補い、補ったことが分かる', () => {
    const fit = ransacFit(parabola([0, 1, 2, 5, 6, 9, 10]), 16);
    const done = interpolateGaps(fit, 60);
    expect(done.map((p) => p.frame)).toEqual(range(0, 11));
    expect(done.filter((p) => p.interpolated).map((p) => p.frame)).toEqual([3, 4, 7, 8]);
  });

  it('補った位置は真の放物線に乗る', () => {
    const fit = ransacFit(parabola([0, 1, 2, 5, 6, 9, 10]), 16);
    interpolateGaps(fit, 60)
      .filter((p) => p.interpolated)
      .forEach((p) => {
        expect(p.x).toBeCloseTo(evaluate(TRUTH_X, p.frame / 60), 6);
        expect(p.y).toBeCloseTo(evaluate(TRUTH_Y, p.frame / 60), 6);
      });
  });

  it('fps が正でなければ例外にする', () => {
    const fit = ransacFit(parabola(range(0, 6)), 16);
    expect(() => interpolateGaps(fit, 0)).toThrow('fps');
  });
});

describe('estimateSpeedKmh', () => {
  it('インライアの時間幅で投本間 9.22m を割る', () => {
    const fit = ransacFit(parabola(range(0, 25)), 16); // t = 0 〜 0.4 秒
    expect(estimateSpeedKmh(fit)).toBeCloseTo((9.22 / 0.4) * 3.6, 6);
  });
});
