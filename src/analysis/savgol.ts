/**
 * Savitzky-Golay フィルタ。scipy.signal.savgol_filter(x, window, polyorder)（mode='interp'）と同じ結果を返す。
 * - 中央部: 窓内に polyorder 次の多項式を最小二乗で当て、中心での値
 * - 端（先頭・末尾の window/2 点）: 先頭／末尾の window 点に多項式を当て、その多項式を各位置で評価
 */

/** 最小二乗で多項式の係数を求める（t は中心を 0 に寄せて数値を安定させる）。 */
function polyfit(ts: readonly number[], ys: readonly number[], order: number): number[] {
  const size = order + 1;
  const ata = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const aty = new Array<number>(size).fill(0);
  ts.forEach((t, i) => {
    const powers = Array.from({ length: size }, (_, k) => t ** k);
    for (let r = 0; r < size; r++) {
      aty[r] += powers[r] * ys[i];
      for (let c = 0; c < size; c++) ata[r][c] += powers[r] * powers[c];
    }
  });
  return solve(ata, aty);
}

/** ガウスの消去法（部分ピボット選択）。 */
function solve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    const pivot = m.reduce((best, row, r) => (r >= col && Math.abs(row[col]) > Math.abs(m[best][col]) ? r : best), col);
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = col + 1; r < n; r++) {
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = m[r][n];
    for (let c = r + 1; c < n; c++) sum -= m[r][c] * x[c];
    x[r] = sum / m[r][r];
  }
  return x;
}

const evaluate = (coeffs: readonly number[], t: number) => coeffs.reduce((s, c, k) => s + c * t ** k, 0);

/** 窓の中心で評価するための畳み込み係数（中心 0、窓内の位置 -h..h）。 */
function centerCoefficients(window: number, polyorder: number): number[] {
  const half = (window - 1) / 2;
  const ts = Array.from({ length: window }, (_, i) => i - half);
  // 各サンプルを単位ベクトルにしたときの中心値 = そのサンプルの重み
  return ts.map((_, j) => {
    const unit = ts.map((__, i) => (i === j ? 1 : 0));
    return evaluate(polyfit(ts, unit, polyorder), 0);
  });
}

export function savgolFilter(values: readonly number[], window: number, polyorder: number): number[] {
  const n = values.length;
  if (window % 2 === 0 || window <= polyorder) throw new Error(`窓長が不正です: window=${window}, polyorder=${polyorder}`);
  if (window > n) throw new Error(`系列（${n}）が窓長（${window}）より短い`);
  const half = (window - 1) / 2;
  const coeffs = centerCoefficients(window, polyorder);
  const out = values.map((_, i) =>
    i < half || i >= n - half ? Number.NaN : coeffs.reduce((s, c, j) => s + c * values[i - half + j], 0),
  );
  const center = (window - 1) / 2;
  const ts = Array.from({ length: window }, (_, i) => i - center);
  const head = polyfit(ts, values.slice(0, window), polyorder);
  const tail = polyfit(ts, values.slice(n - window), polyorder);
  for (let i = 0; i < half; i++) {
    out[i] = evaluate(head, i - center);
    out[n - window + (window - half) + i] = evaluate(tail, window - half + i - center);
  }
  return out;
}
