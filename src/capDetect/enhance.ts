/**
 * 3コマ差分によるモーション強調（SHARED の tennis.py の移植。manifest の preprocess が 'enhanced' のときだけ使う）。
 *   diff = LUT_gamma(|cur - prev| AND |next - cur|)   … AND はビットごとの論理積（min ではない）
 *   out  = 0.4 * cur + 0.6 * diff                      … 0〜255 に丸める（Uint8ClampedArray の丸め = cv2 と同じ偶数丸め）
 * 先頭のコマは prev = cur（差分ゼロ）、末尾のコマは出力しない（tennis.run と同じ。detectLoop.ts が扱う）。
 * Python 版は元の解像度で強調してから縮小するが、ここでは縮小（レターボックス）した後の画素で強調する（設計書 §9.7）。
 * 余白（rect の外）とアルファは cur のまま。
 */

export const GAMMA = 1.5;

/** Python の astype("uint8") と同じく切り捨てる */
export function gammaLut(gamma: number = GAMMA): Uint8Array {
  return Uint8Array.from({ length: 256 }, (_, i) => Math.floor((i / 255) ** (1 / gamma) * 255));
}

const LUT = gammaLut();

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function enhanceRgba(
  prev: Uint8ClampedArray,
  cur: Uint8ClampedArray,
  next: Uint8ClampedArray,
  width: number,
  height: number,
  rect: Rect,
): Uint8ClampedArray {
  const size = width * height * 4;
  if (prev.length !== size || cur.length !== size || next.length !== size) {
    throw new Error(`画素数が一致しません: ${prev.length} / ${cur.length} / ${next.length} != ${size}`);
  }
  const out = new Uint8ClampedArray(cur);
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const p = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const i = p + c;
        out[i] = 0.4 * cur[i] + 0.6 * LUT[Math.abs(cur[i] - prev[i]) & Math.abs(next[i] - cur[i])];
      }
    }
  }
  return out;
}
