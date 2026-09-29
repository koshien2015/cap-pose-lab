"""SHARED（ultralytics/shared/）を実行して、capDetect の数値一致テスト用 fixture を書き出す。

    SHARED_ROOT=<ultralytics のフォーク>/shared <その venv の python> tools/make_capdetect_fixtures.py

入力は合成データだけ。実在の映像から作った値は公開リポジトリに入れない。
ultralytics の NMS の期待値は、手元の venv の版で作る（版は nms.json に記録する）。
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = os.environ.get("SHARED_ROOT")
if not ROOT:
    sys.exit("SHARED_ROOT に ultralytics/shared/ のパスを指定してください")
sys.path.insert(0, ROOT)

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
import ultralytics  # noqa: E402

import trajectory_fitter as tf  # noqa: E402

try:
    from ultralytics.utils.nms import non_max_suppression  # noqa: E402
except ImportError:  # 古い版
    from ultralytics.utils.ops import non_max_suppression  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "src" / "capDetect" / "__fixtures__"
FPS = 60.0
HEIGHT = 1080
THRESHOLD = HEIGHT * 0.015  # 設計書 §9.7: 画面の高さの 1.5%


def write(name: str, data) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print("wrote", name)


def trajectory_case() -> dict:
    """外れ値の無い放物線（px・秒）。全点がインライアになるので、最終フィットは Python と決定的に一致する。"""
    rng = np.random.default_rng(11)
    release = 100
    frames = [f for f in range(release + 1, release + 26) if f not in (105, 106, 113)]
    points = []
    for f in frames:
        t = (f - release) / FPS
        x = 900 + 300 * t - 50 * t * t + rng.normal(0, 0.8)
        y = 400 + 200 * t + 600 * t * t + rng.normal(0, 0.8)
        points.append(tf.TrajectoryPoint(frame=f, t=t, x=float(x), y=float(y)))
    fit = tf.ransac_fit(points, inlier_threshold=THRESHOLD)
    assert not fit.outliers, "合成データに外れ値が出た。ノイズを見直す"
    t_end = max(p.t for p in fit.inliers)
    return {
        "fps": FPS,
        "threshold": THRESHOLD,
        "points": [{"frame": p.frame, "t": p.t, "x": p.x, "y": p.y} for p in points],
        "coeffs_x": list(fit.coeffs_x),
        "coeffs_y": list(fit.coeffs_y),
        "rmse": fit.rmse,
        "end_position": list(tf.position_at(fit, t_end)),
        "completed": [{"frame": p.frame, "t": p.t, "x": p.x, "y": p.y} for p in tf.interpolate_gaps(fit, FPS)],
        "speed_kmh": tf.estimate_speed_kmh(fit),
    }


def fit_quadratic_cases() -> list:
    rng = np.random.default_rng(5)
    cases = []
    for n in (3, 4, 12):
        ts = np.sort(rng.uniform(0, 0.5, n))
        vs = 500 + 120 * ts - 800 * ts ** 2 + rng.normal(0, 2, n)
        cases.append({"ts": ts.tolist(), "vs": vs.tolist(), "coeffs": tf._fit_quadratic(ts, vs).tolist()})
    return cases


def enhance_cases() -> dict:
    """tennis.run のループ本体と同じ演算を、合成した 3 コマに掛ける（BGR・uint8）。"""
    rng = np.random.default_rng(17)
    lut = np.array([((i / 255.0) ** (1.0 / 1.5)) * 255 for i in range(256)]).astype("uint8")

    def enhance(prev, cur, nxt):
        diff = cv2.bitwise_and(cv2.absdiff(cur, prev), cv2.absdiff(nxt, cur))
        diff = cv2.LUT(diff, lut)
        return cv2.addWeighted(cur, 0.4, diff, 0.6, 0)

    shape = (6, 8, 3)
    prev, cur, nxt = (rng.integers(0, 256, shape, dtype=np.uint8) for _ in range(3))
    return {
        "lut": lut.tolist(),
        "width": shape[1],
        "height": shape[0],
        "cases": [
            {"name": "middle", "prev": prev.ravel().tolist(), "cur": cur.ravel().tolist(), "next": nxt.ravel().tolist(),
             "expected": enhance(prev, cur, nxt).ravel().tolist()},
            # 先頭のコマ: tennis.run では prev = cur になる（差分がゼロ）
            {"name": "first", "prev": cur.ravel().tolist(), "cur": cur.ravel().tolist(), "next": nxt.ravel().tolist(),
             "expected": enhance(cur, cur, nxt).ravel().tolist()},
        ],
    }


def nms_case() -> dict:
    """[1, 4+nc, N] の合成出力に ultralytics 自身の NMS を掛けた結果を期待値にする。"""
    nc, n = 11, 40
    rng = np.random.default_rng(23)
    pred = np.zeros((1, 4 + nc, n), dtype=np.float32)
    centers = rng.uniform(50, 600, (n, 2))
    # 近い位置に重なる箱の組を作る（同じクラス・違うクラス）
    centers[1] = centers[0] + 3
    centers[2] = centers[0] + 5
    centers[4] = centers[3] + 2
    sizes = rng.uniform(8, 60, (n, 2))
    pred[0, 0] = centers[:, 0]
    pred[0, 1] = centers[:, 1]
    pred[0, 2] = sizes[:, 0]
    pred[0, 3] = sizes[:, 1]
    scores = rng.uniform(0.01, 0.95, (nc, n)).astype(np.float32) * (rng.uniform(0, 1, (nc, n)) < 0.15)
    scores[:, 0:7] = 0.0  # 以下で決め打ちするアンカーは、ほかのクラスの値を消しておく
    scores[0, 0], scores[0, 1], scores[0, 2] = 0.9, 0.8, 0.7  # 同じクラスで重なる → 1つだけ残る
    scores[0, 3], scores[1, 4] = 0.6, 0.5  # 違うクラスで重なる → 両方残る
    scores[0, 5] = 0.15  # 閾値ちょうど（float32 の 0.15）は採らない（「より大きい」）
    scores[2, 6], scores[7, 6] = 0.4, 0.4  # 同点のクラス → 先の番号（2）を採る
    pred[0, 4:] = scores
    # NMS は入力をその場で書き換える（xywh → xyxy）。from_numpy はメモリを共有するので、コピーを渡す
    out = non_max_suppression(torch.from_numpy(pred.copy()), conf_thres=0.15, iou_thres=0.7, max_det=300)[0].numpy()
    return {
        "ultralytics": ultralytics.__version__,
        "num_classes": nc,
        "output": pred.ravel().tolist(),
        "expected": [{"box": row[:4].tolist(), "score": float(row[4]), "cls": int(row[5])} for row in out],
    }


def main() -> int:
    write("trajectory", {"fit": trajectory_case(), "fit_quadratic": fit_quadratic_cases()})
    write("enhance", enhance_cases())
    write("nms", nms_case())
    return 0


if __name__ == "__main__":
    sys.exit(main())
