"""manifest.json に従って姿勢推定モデルを ONNX に書き出す。

CI（.github/workflows/pages.yml）と手元の両方で使う。書き出し先は public/models/。
手元では:  uv run --with-requirements tools/requirements.txt python tools/export_models.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "public" / "models"


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


def main() -> int:
    manifest = json.loads((MODELS / "manifest.json").read_text(encoding="utf-8"))
    for entry in manifest["pose"]:
        export_pose(entry)
    return 0


if __name__ == "__main__":
    sys.exit(main())
