"""manifest.json に従ってモデルを ONNX に書き出す。

CI（.github/workflows/pages.yml）と手元の両方で使う。書き出し先は public/models/。
手元では:  uv run --with-requirements tools/requirements.txt python tools/export_models.py [--keep-fp32]

キャップ検出モデルは fp32 だと 1ファイル約 104MB になるため、fp16 に変換して配信する（設計書 §5.2）。
ultralytics の half=True は CPU の書き出しでは効かないので、fp32 で書き出してから onnxruntime 同梱の変換で fp16 にする
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


def check_detector(fp32: Path, fp16: Path, num_classes: int) -> None:
    """fp16 が fp32 と同じ形の出力を出し、値が大きくずれていないことを確かめる（NMS 無しの [1, 4+nc, N]）。"""
    rng = np.random.default_rng(0)
    image = np.clip(0.45 + rng.normal(0, 0.1, (1, 3, 384, 640)), 0, 1).astype(np.float32)
    outs = []
    for path in (fp32, fp16):
        session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        outs.append(session.run(None, {session.get_inputs()[0].name: image})[0])
    a, b = outs
    if a.shape != b.shape or a.shape[1] != 4 + num_classes:
        raise SystemExit(f"出力の形が想定と違います: fp32 {a.shape} / fp16 {b.shape}")
    box_diff = float(np.abs(a[:, :4] - b[:, :4]).max())
    score_diff = float(np.abs(a[:, 4:] - b[:, 4:]).max())
    print(f"fp16 check: shape {a.shape}, box diff {box_diff:.3f}px, score diff {score_diff:.4f}")
    if box_diff > 2.0 or score_diff > 0.05:
        raise SystemExit("fp16 の出力が fp32 から大きくずれています")


def export_detector(entry: dict, keep_fp32: bool) -> Path:
    target = MODELS / entry["file"]
    if target.exists():
        print(f"skip (exists): {target.name}")
        return target
    weights = fetch_weights(entry)
    # dynamic=True: 縦横どちらの動画でも同じファイルで推論できるようにする
    fp32 = Path(YOLO(str(weights)).export(format="onnx", dynamic=True, simplify=True, opset=17, imgsz=entry["imgsz"]))
    onnx.save(convert_float_to_float16(onnx.load(str(fp32)), keep_io_types=True), str(target))
    check_detector(fp32, target, len(entry["classes"]))
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
