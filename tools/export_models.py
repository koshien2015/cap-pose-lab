"""manifest.json に従ってモデルを ONNX に書き出す。

CI（.github/workflows/pages.yml）と手元の両方で使う。書き出し先は public/models/。
手元では:  uv run --with-requirements tools/requirements.txt python tools/export_models.py [--keep-fp32]

キャップ検出モデルは manifest の precision に従う。fp16 のときは（1ファイル 100MB を超える大きなモデル用）、
ultralytics の half=True が CPU の書き出しでは効かないので、fp32 で書き出してから onnxruntime 同梱の変換で fp16 にする
（onnxconverter-common の変換は Resize の前後で型が食い違い、読み込めないモデルになった）。
入出力は float32 のまま残し（keep_io_types）、ブラウザ側の入力の作り方を姿勢推定と同じにする。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnxruntime.transformers.float16 import convert_float_to_float16
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "public" / "models"
WEIGHTS = ROOT / "tools" / "weights"  # *.pt は .gitignore 済み


def export_pose(entry: dict) -> Path:
    target = MODELS / entry["file"]
    if target.exists():
        print(f"skip (exists): {target.name}")
        return target
    model = YOLO(entry["weights"])  # 公式の重みは初回に自動ダウンロードされる
    # dynamic=True: 縦横どちらの動画でも同じファイルで推論できるようにする
    exported = Path(model.export(format="onnx", dynamic=True, simplify=True, opset=17, imgsz=entry["imgsz"]))
    exported.replace(target)
    print(f"exported: {target.name} ({target.stat().st_size / 1e6:.1f} MB)")
    return target


def release_asset_url(entry: dict) -> str:
    return entry["source"].replace("/releases/tag/", "/releases/download/") + "/" + entry["weights"]


def fetch_weights(entry: dict) -> Path:
    path = WEIGHTS / entry["weights"]
    if not path.exists():
        WEIGHTS.mkdir(parents=True, exist_ok=True)
        print(f"download: {release_asset_url(entry)}")
        urllib.request.urlretrieve(release_asset_url(entry), path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != entry["sha256"]:
        path.unlink()
        raise SystemExit(f"重みのハッシュが一致しません: {entry['weights']} ({digest})")
    return path


def expected_shape_ok(shape: tuple, entry: dict) -> bool:
    """yolov8-raw は NMS 前の [1, 4+nc, N]、yolo26-end2end は NMS 済みの [1, 300, 6]。"""
    if entry["output"] == "yolo26-end2end":
        return shape[1:] == (300, 6)
    return shape[1] == 4 + len(entry["classes"])


def run_once(path: Path, image: np.ndarray) -> np.ndarray:
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    return session.run(None, {session.get_inputs()[0].name: image})[0]


def check_detector(fp32: Path, target: Path, entry: dict) -> None:
    """出力の形が manifest の output と合うこと、fp16 なら fp32 から大きくずれていないことを確かめる。"""
    rng = np.random.default_rng(0)
    height = int(np.ceil(entry["imgsz"] * 9 / 16 / 32) * 32)
    image = np.clip(0.45 + rng.normal(0, 0.1, (1, 3, height, entry["imgsz"])), 0, 1).astype(np.float32)
    a = run_once(fp32, image)
    if not expected_shape_ok(a.shape, entry):
        raise SystemExit(f"出力の形が manifest（{entry['output']}）と合いません: {a.shape}")
    print(f"output check: shape {a.shape}")
    if target == fp32:
        return
    b = run_once(target, image)
    box_diff = float(np.abs(a[:, :4] - b[:, :4]).max())
    score_diff = float(np.abs(a[:, 4:] - b[:, 4:]).max())
    print(f"fp16 check: shape {b.shape}, box diff {box_diff:.3f}px, score diff {score_diff:.4f}")
    if a.shape != b.shape or box_diff > 2.0 or score_diff > 0.05:
        raise SystemExit("fp16 の出力が fp32 から大きくずれています")


def export_detector(entry: dict, keep_fp32: bool) -> Path:
    target = MODELS / entry["file"]
    if target.exists():
        print(f"skip (exists): {target.name}")
        return target
    weights = fetch_weights(entry)
    # dynamic=True: 縦横どちらの動画でも同じファイルで推論できるようにする
    fp32 = Path(YOLO(str(weights)).export(format="onnx", dynamic=True, simplify=True, opset=17, imgsz=entry["imgsz"]))
    if entry["precision"] == "fp32":
        check_detector(fp32, fp32, entry)
        fp32.replace(target)
    else:
        onnx.save(convert_float_to_float16(onnx.load(str(fp32)), keep_io_types=True), str(target))
        check_detector(fp32, target, entry)
        if keep_fp32:
            kept = MODELS / target.name.replace(".fp16.", ".fp32.")
            fp32.replace(kept)
            print(f"kept fp32: {kept.name} ({kept.stat().st_size / 1e6:.1f} MB)")
        else:
            fp32.unlink()
    print(f"exported: {target.name} ({target.stat().st_size / 1e6:.1f} MB)")
    return target


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-fp32", action="store_true", help="比較用に fp32 の検出モデルも public/models/ に残す（配信はしない）")
    args = parser.parse_args()
    manifest = json.loads((MODELS / "manifest.json").read_text(encoding="utf-8"))
    for entry in manifest["pose"]:
        export_pose(entry)
    export_detector(manifest["capDetector"], args.keep_fp32)
    return 0


if __name__ == "__main__":
    sys.exit(main())
