"""手元の動画で、Python（ultralytics + SHARED の trajectory_fitter）とブラウザ版の結果を見比べる（手作業の確認用）。

    SHARED_ROOT=<ultralytics のフォーク>/shared <その venv の python> tools/compare_trajectory.py 動画.mp4 --browser 動画_trajectory.json

- 全コマを推論する。重み・入力サイズ・前処理（raw / enhanced）は manifest の capDetector、信頼度は 0.15
  enhanced は tennis.py と同じ3コマ差分の強調を元の解像度でかける（先頭は prev = cur、末尾のコマは推論しない）
- ブラウザ版が推論したコマだけを突き合わせ、検出の一致と位置の差を出す
- 球速は、ブラウザ版と同じリリースのコマと同じ閾値（画面の高さ × 0.015）で、Python の trajectory_fitter から出す
- OpenCV は回転メタデータを反映して読む（縦動画も表示の向きの座標になる）
動画や結果の JSON は公開リポジトリに入れない。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = os.environ.get("SHARED_ROOT")
if not SHARED:
    sys.exit("SHARED_ROOT に ultralytics/shared/ のパスを指定してください")
sys.path.insert(0, SHARED)

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from ultralytics import YOLO  # noqa: E402

import trajectory_fitter as tf  # noqa: E402

CONF = 0.15
THRESHOLD_RATIO = 0.015


GAMMA_LUT = np.array([((i / 255.0) ** (1.0 / 1.5)) * 255 for i in range(256)]).astype("uint8")


def enhance(prev: np.ndarray, cur: np.ndarray, nxt: np.ndarray) -> np.ndarray:
    """tennis.run のループ本体と同じ演算。"""
    diff = cv2.bitwise_and(cv2.absdiff(cur, prev), cv2.absdiff(nxt, cur))
    return cv2.addWeighted(cur, 0.4, cv2.LUT(diff, GAMMA_LUT), 0.6, 0)


def read_frames(video: str) -> tuple[list[np.ndarray], float]:
    capture = cv2.VideoCapture(video)
    fps = capture.get(cv2.CAP_PROP_FPS)
    frames = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    return frames, fps


def model_inputs(frames: list[np.ndarray], preprocess: str):
    if preprocess != "enhanced":
        yield from enumerate(frames)
        return
    for index in range(len(frames) - 1):  # 末尾のコマは推論しない
        yield index, enhance(frames[max(index - 1, 0)], frames[index], frames[index + 1])


def detect_all(video: str, model: YOLO, imgsz: int, preprocess: str) -> tuple[dict[int, tuple[float, float]], float, int]:
    cap_id = next(i for i, name in model.names.items() if name == "cap")
    frames, fps = read_frames(video)
    found: dict[int, tuple[float, float]] = {}
    height = frames[0].shape[0] if frames else 0
    for index, image in model_inputs(frames, preprocess):
        boxes = model(image, imgsz=imgsz, conf=CONF, verbose=False)[0].boxes
        caps = [(float(b.conf[0]), b.xyxy[0].tolist()) for b in boxes if int(b.cls[0]) == cap_id]
        if caps:
            _, (x1, y1, x2, y2) = max(caps, key=lambda c: c[0])
            found[index] = ((x1 + x2) / 2, (y1 + y2) / 2)
    return found, fps, height


def python_speed(found: dict, fps: float, height: int, release: int | None) -> float | None:
    frames = sorted(f for f in found if release is None or f >= release)
    origin = release if release is not None else (frames[0] if frames else 0)
    points = [tf.TrajectoryPoint(frame=f, t=(f - origin) / fps, x=found[f][0], y=found[f][1]) for f in frames]
    try:
        return tf.estimate_speed_kmh(tf.ransac_fit(points, inlier_threshold=height * THRESHOLD_RATIO))
    except ValueError as error:
        print(f"Python 版はフィットできませんでした: {error}")
        return None


def compare(found: dict, browser: dict) -> None:
    inferred = {f for start, end in browser["inferredFrames"] for f in range(start, end)}
    mine = {d["frame"]: (d["x"], d["y"]) for d in browser["detections"]}
    both = sorted(f for f in inferred if f in found and f in mine)
    only_python = sorted(f for f in inferred if f in found and f not in mine)
    only_browser = sorted(f for f in mine if f not in found)
    print(f"ブラウザ版が推論したコマ {len(inferred)} / 両方で検出 {len(both)}")
    print(f"Python のみ {len(only_python)} {only_python[:10]} / ブラウザのみ {len(only_browser)} {only_browser[:10]}")
    if both:
        diffs = [float(np.hypot(found[f][0] - mine[f][0], found[f][1] - mine[f][1])) for f in both]
        print(f"位置の差: 平均 {np.mean(diffs):.2f}px / 最大 {np.max(diffs):.2f}px")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--browser", help="ブラウザ版で保存した _trajectory.json")
    args = parser.parse_args()
    detector = json.loads((ROOT / "public" / "models" / "manifest.json").read_text(encoding="utf-8"))["capDetector"]
    model = YOLO(str(ROOT / "tools" / "weights" / detector["weights"]))  # export_models.py が取得済みのもの
    found, fps, height = detect_all(args.video, model, detector["imgsz"], detector["preprocess"])
    print(f"前処理 {detector['preprocess']} / fps {fps:.2f} / 高さ {height}px / キャップを検出したコマ {len(found)}")
    browser = json.loads(Path(args.browser).read_text(encoding="utf-8")) if args.browser else None
    speed = python_speed(found, fps, height, browser["release"]["frame"] if browser else None)
    print(f"球速: Python {None if speed is None else round(speed, 1)} km/h" + (f" / ブラウザ {browser['speedKmh']} km/h" if browser else ""))
    if browser:
        compare(found, browser)
    return 0


if __name__ == "__main__":
    sys.exit(main())
