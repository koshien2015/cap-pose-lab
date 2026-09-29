# cap-pose-lab 計画5: キャップ検出と投球の軌跡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 投手の後方から撮った1球分の動画から、キャップの軌跡（映像に重ねて描く）と平均球速を「推定値（試験的）」としてブラウザ内で出し、`{動画名}_trajectory.json` に書き出せるようにする。

**Architecture:** 検出モデル（YOLOv8m・11クラス）を CI で ONNX（fp16・入出力は float32）に書き出して Pages に同梱する。`src/capDetect/` に DOM・ORT に依存しない純粋関数（出力の解読と NMS・差分強調・推論の間引き・リリース候補・軌跡フィット・推論ループの段取り）を置き、Python 版と fixture で数値一致を確かめる。ブラウザ依存の層は `src/inference/runDetect.ts` に薄く置き、画面は `src/trajectory/` にまとめる。

**Tech Stack:** 計画1・2と同じ（Vite, React, TypeScript, Tailwind, Vitest, onnxruntime-web 1.30.0, mp4box 2.4.1）。ONNX 書き出しは ultralytics 8.4.53 + onnxconverter-common。fixture 生成のみ手元の Python（`ultralytics/shared/` と、その venv の ultralytics・torch・opencv）。

**Spec:** `docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md`（§9 全体、§5.1 の `capDetector`、§12 のキャップ検出のリスク）。計画1・2の成果物の上に作る。

**移植元:** `ultralytics/shared/`（非公開の手元リポジトリ）の `trajectory_fitter.py`・`tennis.py`・`prefilter.py`（`InferenceGate`）・`pitching_analysis.py`（`detect_release` と、キャップ・投手の取り出し方）。以下 `SHARED` と書く。**移植は1対1で行い、設計書 §9.7 に書いた点以外は「改善」しない。**

## Global Constraints

- 計画1・2の Global Constraints をすべて引き継ぐ（Author `ckoshien <ckoshien@gmail.com>`・コミット形式 `<type>: <日本語>` と `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`・pnpm・`alert` 禁止・44px・専門用語を主画面に出さない・1ファイル 800 行／関数 50 行目安・イミュータブル）
- 検出の既定値: 信頼度 `0.15`（「より大きい」で判定）、NMS の IoU `0.7`、最大 `300` 件、クラスごとの NMS（ultralytics の `non_max_suppression` と同じ）
- 推論の間引き: `searchStride=5`（`frame % 5 === 0` のコマを推論）、`denseFrames=30`（検出したコマ + 30 まで連続）、`lookback=4`（検出したら直前の推論していない最大4コマを遡って推論）
- 軌跡: 最低 `5` 点、RANSAC `200` 回・シード `0`、外れ値の閾値は `画面の高さ × 0.015`（px）、投本間 `9.22` m、球速の注記範囲 `30〜150` km/h
- クラス番号はコードに書かない。manifest の `classes` から名前（`cap` / `pitcher_motion` / `pitcher_release`）で引く
- 座標は回転を反映した後の表示ピクセル。`t` は原点のコマ（リリース、無ければ最初の検出）からの秒数
- 記録は推論したコマだけ（推論していないコマは記録しない）。記録・フィット・書き出しはすべて **frame 番号の順に並べてから** 使う
- ゾーン・コース・カメラ角度の補正は作らない（設計書 §9 で範囲外）
- fixture は合成データだけから作る。実在の映像やその座標を公開リポジトリに入れない
- 主画面の文言は「推定値（試験的）」を必ず付け、専門用語（RANSAC, NMS, fp16, WebGPU など）は「詳しい情報」の中だけに出す
- 画面の画像は `VideoFrame` を抱えない。縮小画像（`ImageBitmap`）と RGBA のコピーだけを持つ（`decodeFrames` はデコーダへの投入を 16 に絞っているため、フレームを閉じずに持つと止まる）

## Review Focus

- 遡って推論した記録は処理順が frame 順と食い違う（k, k-4, k-3, …）: リリース候補・フィット・`inferredFrames` は frame 順で計算されるべき → Task 6・Task 8 にテスト
- リリースより前にもキャップが写っている（投手の手の中）: リリースが分かっていればそのコマより前は使わない。リリースを最後の検出より後に指定しても落ちず、案内を出す → Task 7 にテスト
- iPhone の縦動画（回転 90°）: 検出座標は縦長の表示座標で出て、外れ値の閾値は表示の高さから決まる → Task 4・Task 7 にテスト
- 解析の途中で中止・失敗: 抱えていた縮小画像をすべて閉じる（スマホのメモリ）→ Task 8 にテスト
- 1コマにキャップらしきものが複数・投手の枠が2種類同時に出る: 信頼度が最も高いものだけを採る（Python 版と同じ）→ Task 4 にテスト

---

## ファイル構成

```
cap-pose-lab/
  public/models/manifest.json           capDetector を追加
  tools/
    export_models.py                    検出モデルの取得（ハッシュ確認）・ONNX 書き出し・fp16 変換・確認
    requirements.txt                    onnxconverter-common を追加
    make_capdetect_fixtures.py          SHARED を使って capDetect の fixture を書き出す
    compare_trajectory.py               手元の動画で Python とブラウザ版の結果を見比べる（手作業の確認用）
  src/
    diagnostics.ts, diagnostics.html    「キャップ検出で推論を試す」を追加
    inference/
      manifest.ts                       CapDetector スキーマ、modelUrl の汎用化
      frameCanvas.ts                    FramePreprocessor.toRgba を追加
      estimate.ts                       estimateDetectSeconds を追加
      speedStore.ts                     キーに 'capDetect' を許す
      runDetect.ts                      1本分の検出（ブラウザ依存の薄い層）
    capDetect/
      __fixtures__/*.json               make_capdetect_fixtures.py の出力（git 管理）
      fixtures.ts                       fixture の読み込み（テスト用）
      syntheticThrow.ts                 テスト用の合成投球（テスト用）
      trajectory.ts                     2次式フィット・RANSAC・補間・球速
      decodeDetect.ts                   出力の解読・NMS・元座標への戻し
      records.ts                        1コマの検出 → FrameRecord（キャップ・投手の状態）
      enhance.ts                        3コマ差分の強調（enhanced 用）
      gate.ts                           推論の間引き
      release.ts                        リリース候補
      detectLoop.ts                     推論ループの段取り（間引き・遡り・強調の窓・画像の保持）
      analyzeThrow.ts                   記録 → 軌跡と球速
      trajectoryJson.ts                 書き出す JSON
    trajectory/
      messages.ts                       環境・失敗の文言
      TrajectoryFlow.tsx                準備 → 同意 → 解析中 → 結果
      TrajectoryResult.tsx              結果画面
      drawTrajectory.ts                 canvas への描画
    ui/
      ErrorPanel.tsx                    App のエラー表示を切り出す
      VideoPicker.tsx                   1本だけ選ぶ使い方を追加
      StartScreen.tsx                   「投球の軌跡を見る（試験的）」を追加
      EnvStatus.tsx                     文言の差し替えを追加
    App.tsx                             スタート画面からの分岐
  vite.config.ts                        カバレッジの対象に capDetect/ と trajectory/ を追加
  README.md                             使い方と実映像での確認手順
```

---

### Task 1: 検出モデルの書き出しと manifest、ブラウザでの速度確認

**Files:**
- Modify: `public/models/manifest.json`
- Modify: `src/inference/manifest.ts`
- Modify: `src/inference/manifest.test.ts`
- Modify: `tools/export_models.py`
- Modify: `tools/requirements.txt`
- Modify: `src/diagnostics.ts`, `diagnostics.html`

**Interfaces:**
- Produces:
  - `type CapDetector`（`version, weights, sha256, source, file, imgsz, sizeMB, preprocess: 'raw' | 'enhanced', output: 'yolov8-raw', classes: string[], license`）
  - `Manifest['capDetector']: CapDetector`
  - `modelUrl(model: { readonly file: string }): string`（`PoseModel` 以外にも使えるようにする）
  - `public/models/cap-detector-20250510.fp16.onnx`（git 管理外。CI と手元で書き出す）

- [ ] **Step 1: manifest のテストを先に書く**

`src/inference/manifest.test.ts` の `describe('parseManifest', ...)` に追加する:

```ts
  it('キャップ検出モデルを読める', () => {
    const m = parseManifest(manifestJson);
    expect(m.capDetector.imgsz).toBe(640);
    expect(m.capDetector.preprocess).toBe('raw');
    expect(m.capDetector.classes[0]).toBe('cap');
  });

  it('キャップ検出モデルに必要なクラスが無ければ例外にする', () => {
    const bad = { ...manifestJson, capDetector: { ...manifestJson.capDetector, classes: ['cap', 'umpire'] } };
    expect(() => parseManifest(bad)).toThrow('pitcher_motion');
  });

  it('前処理の種類が未知なら例外にする', () => {
    const bad = { ...manifestJson, capDetector: { ...manifestJson.capDetector, preprocess: 'motion3ch' } };
    expect(() => parseManifest(bad)).toThrow();
  });
```

`describe('modelUrl / loadManifest', ...)` に追加する:

```ts
  it('キャップ検出モデルも BASE_URL 配下の models/ を指す', () => {
    const m = parseManifest(manifestJson);
    expect(modelUrl(m.capDetector)).toBe(`${import.meta.env.BASE_URL}models/cap-detector-20250510.fp16.onnx`);
  });
```

既存の `必須項目が欠けていれば例外にする` などの `{ version: 1, pose: [...] }` は `capDetector` が無いので、そのままでも例外になる（期待どおり）。`pose が空なら例外にする` も同様。

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm vitest run src/inference/manifest.test.ts`
Expected: FAIL（`capDetector` が undefined）

- [ ] **Step 3: manifest.json に capDetector を足す**

`public/models/manifest.json` の `"pose": [...]` の後ろに追加する（`sizeMB` は仮の値。Step 8 で実測値に直す）:

```json
  "capDetector": {
    "version": "20250510",
    "weights": "yolo8m_20250510.pt",
    "sha256": "ade4f5c9d33e204bf8a8668b358bd9078861abd983ffbc8b61330e8d5f5b3399",
    "source": "https://github.com/koshien2015/cap-pose-lab/releases/tag/cap-detector-20250510",
    "file": "cap-detector-20250510.fp16.onnx",
    "imgsz": 640,
    "sizeMB": 52,
    "preprocess": "raw",
    "output": "yolov8-raw",
    "classes": ["cap", "pitcher_motion", "batter_stance", "umpire", "catcher", "pitcher_release",
                "batter_swing", "catcher_stance", "catcher_catch", "catcher_throw", "catcher_miss"],
    "license": "AGPL-3.0"
  }
```

- [ ] **Step 4: manifest.ts にスキーマを足す**

`src/inference/manifest.ts` の `ManifestSchema` の前に追加し、`ManifestSchema` と `modelUrl` を直す:

```ts
/** 名前で引くクラス。番号はモデルごとに違いうるのでコードに書かない */
export const REQUIRED_DETECTOR_CLASSES = ['cap', 'pitcher_motion', 'pitcher_release'] as const;

const CapDetectorSchema = z
  .object({
    version: z.string().min(1),
    weights: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    source: z.url(),
    file: z.string().min(1),
    imgsz: z.number().int().positive(),
    sizeMB: z.number().positive(),
    preprocess: z.enum(['raw', 'enhanced']),
    output: z.literal('yolov8-raw'),
    classes: z.array(z.string().min(1)).min(1),
    license: z.string().min(1),
  })
  .refine((d) => REQUIRED_DETECTOR_CLASSES.every((c) => d.classes.includes(c)), {
    message: `キャップ検出モデルのクラスに ${REQUIRED_DETECTOR_CLASSES.join(' / ')} が必要です`,
  });

const ManifestSchema = z.object({
  version: z.literal(1),
  pose: z.array(PoseModelSchema).min(1),
  capDetector: CapDetectorSchema,
});

export type PoseModel = z.infer<typeof PoseModelSchema>;
export type CapDetector = z.infer<typeof CapDetectorSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
```

```ts
export function modelUrl(model: { readonly file: string }): string {
  return `${import.meta.env.BASE_URL}models/${model.file}`;
}
```

（元の `export type PoseModel` / `export type Manifest` の2行は上に置き換える。`parseManifest` はそのまま。）

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm vitest run src/inference/manifest.test.ts && pnpm tsc -b`
Expected: PASS。型エラーなし

- [ ] **Step 6: export_models.py に検出モデルの書き出しを足す**

`tools/requirements.txt` の末尾に `onnxconverter-common` を1行足す。

`tools/export_models.py` を次のようにする（`export_pose` はそのまま）:

```python
"""manifest.json に従ってモデルを ONNX に書き出す。

CI（.github/workflows/pages.yml）と手元の両方で使う。書き出し先は public/models/。
手元では:  uv run --with-requirements tools/requirements.txt python tools/export_models.py [--keep-fp32]

キャップ検出モデルは fp32 だと 1ファイル約 104MB になるため、fp16 に変換して配信する（設計書 §5.2）。
ultralytics の half=True は CPU の書き出しでは効かないので、fp32 で書き出してから onnxconverter-common で変換する。
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
from onnxconverter_common import float16
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "public" / "models"
WEIGHTS = ROOT / "tools" / "weights"  # *.pt は .gitignore 済み


def export_pose(entry: dict) -> Path:
    ...  # 既存のまま


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
    onnx.save(float16.convert_float_to_float16(onnx.load(str(fp32)), keep_io_types=True), str(target))
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
```

- [ ] **Step 7: 手元で書き出す**

Run: `uv run --with-requirements tools/requirements.txt python tools/export_models.py --keep-fp32`
Expected: `fp16 check: shape (1, 15, 5040), box diff …, score diff …` と `exported: cap-detector-20250510.fp16.onnx (約 52 MB)`、`kept fp32: cap-detector-20250510.fp32.onnx (約 104 MB)`。

- 形が `(1, 15, N)` でない（例: `(1, 300, 6)`）なら、書き出しに NMS が埋め込まれている。`export(..., nms=False)` を足して書き出し直す
- fp16 のファイルが fp32 と同じ大きさなら変換されていない。止めて報告する

- [ ] **Step 8: manifest の sizeMB を実測値にする**

Step 7 の `exported:` の MB を小数1桁に丸めて `public/models/manifest.json` の `capDetector.sizeMB` に書く。

- [ ] **Step 9: 診断ページに「キャップ検出で推論を試す」を足す**

`diagnostics.html` の `#try` ボタンの次に追加する:

```html
    <button id="try-detector" type="button" hidden style="min-height: 44px; padding: 0 16px">キャップ検出で推論を試す（約 52 MB をダウンロード）</button>
```

`src/diagnostics.ts` に追加する（`tryInference` の後ろ）。`?detector=<ファイル名>` で比較用の fp32 を、`?ep=wasm` で CPU 処理を選べるようにする（手元の比較専用。公開サイトには fp32 は置かない）:

```ts
const params = new URLSearchParams(location.search);

/** 1回目はシェーダの準備を含むので、2〜6回目の平均を出す */
async function tryDetector(ep: 'webgpu' | 'wasm') {
  const manifest = await loadManifest();
  const override = params.get('detector');
  const file = override && /^[\w.-]+\.onnx$/.test(override) ? override : manifest.capDetector.file;
  const bytes = await fetchModel(modelUrl({ file }), await openModelCache(), () => undefined);
  const { session, createMs } = await createSession(bytes, ep);
  const [w, h] = [640, 384];
  const input = new Float32Array(3 * w * h).fill(0.45);
  const first = await runPose(session, input, w, h);
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) await runPose(session, input, w, h);
  log(`キャップ検出 ${file} (${ep}): セッション生成 ${Math.round(createMs)} ms / 推論1回（平均） ${Math.round((performance.now() - t0) / 5)} ms / 出力 ${first.length} 要素`);
  await session.release();
  log('OK');
}
```

`main()` の中、`button.addEventListener(...)` の後ろに追加する（`ep` の決め方も `?ep=` を見るように変える）:

```ts
  const detectorButton = document.getElementById('try-detector');
  const detectorEp = params.get('ep') === 'wasm' ? 'wasm' : ep;
  if (detectorButton) {
    detectorButton.hidden = false;
    detectorButton.addEventListener('click', () => {
      detectorButton.hidden = true;
      tryDetector(detectorEp).catch((e) => log(`失敗: ${String(e)}`));
    });
  }
```

（`runPose` は「float32 の入力でモデルを1回動かす」関数なので、検出モデルにもそのまま使える。）

- [ ] **Step 10: Mac Chrome で速度を測る（判断の分かれ目）**

Run: `pnpm dev` を起動し、Mac Chrome で次の3つを開いて「キャップ検出で推論を試す」を押し、表示された数字を控える。

1. `http://localhost:5173/cap-pose-lab/diagnostics.html`（fp16・高速処理）
2. `http://localhost:5173/cap-pose-lab/diagnostics.html?detector=cap-detector-20250510.fp32.onnx`（fp32・高速処理）
3. `http://localhost:5173/cap-pose-lab/diagnostics.html?ep=wasm`（fp16・CPU 処理）

判断:
- 1 が「失敗」（高速処理で fp16 のセッションを作れない）、または 1 が 2 の 1.5 倍より遅い → **ここで止めてユーザーに報告する。** 設計書 §5.2 の fp16 配信を見直す必要がある（fp32 を配信するには Pages の1ファイルの上限の確認が要る）
- それ以外 → 1 と 3 の数字を控えて先へ進む（Task 9 の見積もりの基準値に使う）

控えた数字は `.superpowers/sdd/` の作業記録に書く（git には入れない）。

- [ ] **Step 11: テストとビルドを通してコミットする**

Run: `pnpm test && pnpm build`
Expected: PASS

```bash
git add public/models/manifest.json src/inference/manifest.ts src/inference/manifest.test.ts tools/export_models.py tools/requirements.txt src/diagnostics.ts diagnostics.html
git commit -m "feat: キャップ検出モデルを manifest に足し、fp16 で書き出して診断ページで試せるようにする

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 数値一致テスト用の fixture を Python 版から作る

**Files:**
- Create: `tools/make_capdetect_fixtures.py`
- Create: `src/capDetect/__fixtures__/trajectory.json`, `enhance.json`, `nms.json`（スクリプトの出力）
- Create: `src/capDetect/fixtures.ts`

**Interfaces:**
- Produces:
  - `loadCapFixture<T>(name: 'trajectory' | 'enhance' | 'nms'): T`
  - fixture の形（下の Step 1 の JSON のキー。Task 3〜5 がこのキー名で読む）

- [ ] **Step 1: fixture 生成スクリプトを書く**

`tools/make_capdetect_fixtures.py`:

```python
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
    out = non_max_suppression(torch.from_numpy(pred), conf_thres=0.15, iou_thres=0.7, max_det=300)[0].numpy()
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
```

- [ ] **Step 2: スクリプトを実行する**

Run: `SHARED_ROOT=<ultralytics のフォーク>/shared <ultralytics のフォーク>/pitching/.venv/bin/python tools/make_capdetect_fixtures.py`
Expected: `wrote trajectory` / `wrote enhance` / `wrote nms`。`nms.json` の `expected` が数件あり、`"ultralytics": "8.4.52"` などの版が入っている。

- `assert not fit.outliers` で止まったら、ノイズ（`rng.normal(0, 0.8)`）を小さくする
- `non_max_suppression` の引数名が違うと言われたら、その版の関数の引数名に合わせる（`conf_thres` / `iou_thres` / `max_det`）

- [ ] **Step 3: fixture の読み込みを書く**

`src/capDetect/fixtures.ts`:

```ts
/**
 * 数値一致テスト用。tools/make_capdetect_fixtures.py が Python 版から書き出した期待値を読む。
 * テストからだけ使う。比較は analysis/fixtures.ts の expectClose を使う。
 */

const modules = import.meta.glob<{ default: unknown }>('./__fixtures__/*.json', { eager: true });

export function loadCapFixture<T>(name: 'trajectory' | 'enhance' | 'nms'): T {
  const found = modules[`./__fixtures__/${name}.json`];
  if (!found) throw new Error(`fixture がありません: ${name}`);
  return found.default as T;
}
```

- [ ] **Step 4: 読み込めることを確かめる**

一時的なテストを書かずに、Task 3 の最初のテストで確かめる（ここでは型チェックだけ）。

Run: `pnpm tsc -b`
Expected: エラーなし

- [ ] **Step 5: コミットする**

```bash
git add tools/make_capdetect_fixtures.py src/capDetect/__fixtures__ src/capDetect/fixtures.ts
git commit -m "chore: キャップ検出の数値一致テスト用 fixture を Python 版から生成する

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: 軌跡フィット（2次式・RANSAC・補間・球速）

**Files:**
- Create: `src/capDetect/trajectory.ts`
- Create: `src/capDetect/trajectory.test.ts`
- Modify: `vite.config.ts`（カバレッジの対象）

**移植元:** `SHARED/trajectory_fitter.py` の `_fit_quadratic` / `_evaluate` / `_residuals` / `ransac_fit` / `position_at` / `interpolate_gaps` / `estimate_speed_kmh`。`zone_from_position` と `analyze_pitch` は移植しない（ゾーンは範囲外、組み立ては Task 7）。

**Interfaces:**
- Consumes: `loadCapFixture`（Task 2）、`expectClose(actual, expected, tol)`（`src/analysis/fixtures.ts`）
- Produces:
  - `interface TrajectoryPoint { frame: number; t: number; x: number; y: number }`
  - `interface CompletedPoint extends TrajectoryPoint { interpolated: boolean }`
  - `type Coeffs = readonly [number, number, number]`
  - `interface FitResult { coeffsX: Coeffs; coeffsY: Coeffs; inliers: readonly TrajectoryPoint[]; outliers: readonly TrajectoryPoint[]; rmse: number }`
  - `class FitError extends Error`
  - `MIN_POINTS_FOR_FIT = 5`, `RANSAC_ITERATIONS = 200`, `INLIER_THRESHOLD_RATIO = 0.015`, `PITCH_DISTANCE_M = 9.22`
  - `fitQuadratic(ts: readonly number[], vs: readonly number[]): Coeffs`
  - `evaluate(c: Coeffs, t: number): number`
  - `mulberry32(seed: number): () => number`
  - `ransacFit(points: readonly TrajectoryPoint[], inlierThreshold: number, opts?: { iterations?: number; seed?: number }): FitResult`
  - `positionAt(fit: FitResult, t: number): [number, number]`
  - `interpolateGaps(fit: FitResult, fps: number): CompletedPoint[]`
  - `estimateSpeedKmh(fit: FitResult, distanceM?: number): number`

- [ ] **Step 1: カバレッジの対象を広げる**

`vite.config.ts` の `coverage` を次のようにする（`include` に `src/capDetect/**/*.ts` と `src/trajectory/messages.ts` を足し、`exclude` にテスト用・ブラウザ依存のファイルを足す）:

```ts
      include: ['src/inference/**/*.ts', 'src/tracking/**/*.ts', 'src/export/**/*.ts', 'src/content/**/*.ts', 'src/flow/**/*.ts', 'src/analysis/**/*.ts', 'src/viewer/viewerMath.ts', 'src/capDetect/**/*.ts', 'src/trajectory/messages.ts'],
      // ブラウザ API に直結する層は E2E（計画4）で見る
      exclude: [
        'src/inference/videoSource.ts',
        'src/inference/frameCanvas.ts',
        'src/inference/ortSession.ts',
        'src/inference/runPose.ts',
        'src/inference/runDetect.ts',
        'src/inference/capabilities.ts',
        'src/analysis/fixtures.ts',
        'src/capDetect/fixtures.ts',
        'src/capDetect/syntheticThrow.ts',
        '**/*.test.ts',
      ],
```

- [ ] **Step 2: テストを先に書く**

`src/capDetect/trajectory.test.ts`:

```ts
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
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `pnpm vitest run src/capDetect/trajectory.test.ts`
Expected: FAIL（`./trajectory` が無い）

- [ ] **Step 4: 実装する**

`src/capDetect/trajectory.ts`:

```ts
/**
 * 投球1球分の検出点に、時間の2次式を RANSAC で当てる（SHARED の trajectory_fitter.py の移植）。
 * 座標は表示ピクセル、t は秒。Python 版との違い（設計書 §9.7）:
 * - 外れ値の閾値をピクセルで渡す（呼ぶ側が画面の高さ × INLIER_THRESHOLD_RATIO にする）
 * - 乱数はシード付きの自前実装（mulberry32）。紛らわしい点の並びでは、採る点の組み合わせが Python 版と変わりうる
 */

export const MIN_POINTS_FOR_FIT = 5;
export const RANSAC_ITERATIONS = 200;
/** 外れ値の閾値 = 画面の高さ × この値（px） */
export const INLIER_THRESHOLD_RATIO = 0.015;
export const PITCH_DISTANCE_M = 9.22;

export interface TrajectoryPoint {
  readonly frame: number;
  readonly t: number;
  readonly x: number;
  readonly y: number;
}

export interface CompletedPoint extends TrajectoryPoint {
  readonly interpolated: boolean;
}

/** v = c0 + c1*t + c2*t^2 */
export type Coeffs = readonly [number, number, number];

export interface FitResult {
  readonly coeffsX: Coeffs;
  readonly coeffsY: Coeffs;
  readonly inliers: readonly TrajectoryPoint[];
  readonly outliers: readonly TrajectoryPoint[];
  readonly rmse: number;
}

export class FitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitError';
  }
}

const sum = (values: readonly number[]) => values.reduce((s, v) => s + v, 0);

function det3(m: readonly (readonly number[])[]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** 最小二乗で2次式を当てる（正規方程式を Cramer の公式で解く）。時刻の違う点が3点以上必要 */
export function fitQuadratic(ts: readonly number[], vs: readonly number[]): Coeffs {
  if (ts.length !== vs.length || new Set(ts).size < 3) {
    throw new FitError('2次式を当てるには、時刻の違う点が3点以上必要です');
  }
  const p = (k: number) => sum(ts.map((t) => t ** k));
  const q = (k: number) => sum(ts.map((t, i) => t ** k * vs[i]));
  const a = [
    [p(0), p(1), p(2)],
    [p(1), p(2), p(3)],
    [p(2), p(3), p(4)],
  ];
  const b = [q(0), q(1), q(2)];
  const d = det3(a);
  const solve = (col: number) => det3(a.map((row, r) => row.map((v, c) => (c === col ? b[r] : v)))) / d;
  return [solve(0), solve(1), solve(2)];
}

export function evaluate(c: Coeffs, t: number): number {
  return c[0] + c[1] * t + c[2] * t * t;
}

function residuals(points: readonly TrajectoryPoint[], cx: Coeffs, cy: Coeffs): number[] {
  return points.map((p) => Math.hypot(p.x - evaluate(cx, p.t), p.y - evaluate(cy, p.t)));
}

/** シード付きの乱数（0 以上 1 未満） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0..n-1 から重複なしに3つ選ぶ */
function sampleThree(n: number, random: () => number): number[] {
  const pick = (exclude: readonly number[]): number => {
    const k = Math.floor(random() * n);
    return exclude.includes(k) ? pick(exclude) : k;
  };
  const a = pick([]);
  const b = pick([a]);
  return [a, b, pick([a, b])];
}

function bestInlierMask(
  points: readonly TrajectoryPoint[],
  threshold: number,
  iterations: number,
  random: () => number,
): { readonly mask: readonly boolean[] | null; readonly count: number } {
  let best: { readonly mask: readonly boolean[] | null; readonly count: number } = { mask: null, count: 0 };
  for (let i = 0; i < iterations; i++) {
    const sample = sampleThree(points.length, random).map((k) => points[k]);
    const ts = sample.map((p) => p.t);
    if (new Set(ts).size < 3) continue; // 同じ時刻の点が混ざると解けない
    const cx = fitQuadratic(ts, sample.map((p) => p.x));
    const cy = fitQuadratic(ts, sample.map((p) => p.y));
    const mask = residuals(points, cx, cy).map((r) => r < threshold);
    const count = mask.filter(Boolean).length;
    if (count > best.count) best = { mask, count };
  }
  return best;
}

export function ransacFit(
  points: readonly TrajectoryPoint[],
  inlierThreshold: number,
  opts: { readonly iterations?: number; readonly seed?: number } = {},
): FitResult {
  if (points.length < MIN_POINTS_FOR_FIT) {
    throw new FitError(`フィットには最低${MIN_POINTS_FOR_FIT}点必要です（入力: ${points.length}点）`);
  }
  const ts = points.map((p) => p.t);
  if (Math.max(...ts) - Math.min(...ts) <= 0) {
    throw new FitError('全ての点が同一時刻です。時系列データを渡してください');
  }
  const { mask, count } = bestInlierMask(points, inlierThreshold, opts.iterations ?? RANSAC_ITERATIONS, mulberry32(opts.seed ?? 0));
  if (!mask || count < MIN_POINTS_FOR_FIT) {
    throw new FitError(`軌跡に乗る点が${MIN_POINTS_FOR_FIT}点未満でした（最良: ${count}点）`);
  }
  const inliers = points.filter((_, i) => mask[i]);
  const outliers = points.filter((_, i) => !mask[i]);
  const its = inliers.map((p) => p.t);
  const coeffsX = fitQuadratic(its, inliers.map((p) => p.x));
  const coeffsY = fitQuadratic(its, inliers.map((p) => p.y));
  const rmse = Math.sqrt(sum(residuals(inliers, coeffsX, coeffsY).map((r) => r * r)) / inliers.length);
  return { coeffsX, coeffsY, inliers, outliers, rmse };
}

export function positionAt(fit: FitResult, t: number): [number, number] {
  return [evaluate(fit.coeffsX, t), evaluate(fit.coeffsY, t)];
}

/** インライアの時間範囲で、欠けたコマをフィットした曲線で補う（frame 順） */
export function interpolateGaps(fit: FitResult, fps: number): CompletedPoint[] {
  if (!(fps > 0)) throw new FitError(`fpsは正の値が必要です（入力: ${fps}）`);
  const sorted = [...fit.inliers].sort((a, b) => a.frame - b.frame);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const detected = new Set(sorted.map((p) => p.frame));
  const filled = Array.from({ length: Math.max(0, last.frame - first.frame - 1) }, (_, i) => first.frame + 1 + i)
    .filter((frame) => !detected.has(frame))
    .map((frame) => {
      const t = first.t + (frame - first.frame) / fps;
      const [x, y] = positionAt(fit, t);
      return { frame, t, x, y, interpolated: true };
    });
  return [...sorted.map((p) => ({ ...p, interpolated: false })), ...filled].sort((a, b) => a.frame - b.frame);
}

/**
 * リリース〜捕球の平均球速（km/h）。単眼カメラでは奥行きが取れないため、
 * インライアの時間幅が投本間の移動時間に当たると仮定した平均値。
 */
export function estimateSpeedKmh(fit: FitResult, distanceM: number = PITCH_DISTANCE_M): number {
  const ts = fit.inliers.map((p) => p.t);
  const duration = Math.max(...ts) - Math.min(...ts);
  if (duration <= 0) throw new FitError('軌跡の時間幅が0です。球速を推定できません');
  return (distanceM / duration) * 3.6;
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm vitest run src/capDetect/trajectory.test.ts`
Expected: PASS

- 「3割の外れ値を除く」で外れ値の組が違う場合は、テストのデータ（外れの量 `[200, -150]`）ではなく実装を疑う（`residuals` と `r < threshold` の向き、`sampleThree` の重複）

- [ ] **Step 6: コミットする**

```bash
git add src/capDetect/trajectory.ts src/capDetect/trajectory.test.ts vite.config.ts
git commit -m "feat: 投球の軌跡フィット（2次式・RANSAC・補間・球速）を移植

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 検出出力の解読・NMS と、1コマ分の記録

**Files:**
- Create: `src/capDetect/decodeDetect.ts`, `src/capDetect/decodeDetect.test.ts`
- Create: `src/capDetect/records.ts`, `src/capDetect/records.test.ts`

**移植元:** ultralytics の `non_max_suppression`（`ultralytics/utils/nms.py`）。`SHARED/pitching_analysis.py` の `update`（キャップは最初の1つ＝信頼度が最も高いもの）と `detect_release`（投手の状態は、投手クラスのうち最初の1つ）。

**Interfaces:**
- Consumes: `Letterbox`, `toSourceX`, `toSourceY`, `computeLetterbox`（`src/inference/letterbox.ts`）、`REQUIRED_DETECTOR_CLASSES`（Task 1）、`loadCapFixture`（Task 2）
- Produces:
  - `DETECT_CONF = 0.15`, `NMS_IOU = 0.7`, `MAX_DET = 300`
  - `type Box = readonly [number, number, number, number]`（x1, y1, x2, y2）
  - `interface Detection { box: Box; score: number; cls: number }`
  - `nonMaxSuppression(output: Float32Array, numClasses: number, opts?: { conf?: number; iou?: number; maxDet?: number }): Detection[]`（入力画素、信頼度の高い順）
  - `decodeDetections(output: Float32Array, numClasses: number, lb: Letterbox, opts?): Detection[]`（表示座標）
  - `type PitcherState = 'motion' | 'release' | null`
  - `interface CapPoint { frame: number; x: number; y: number; conf: number }`
  - `interface FrameRecord { frame: number; cap: CapPoint | null; pitcher: PitcherState }`
  - `interface ClassIds { cap: number; pitcherMotion: number; pitcherRelease: number }`
  - `classIds(classes: readonly string[]): ClassIds`
  - `toFrameRecord(frame: number, dets: readonly Detection[], ids: ClassIds): FrameRecord`

- [ ] **Step 1: テストを先に書く**

`src/capDetect/decodeDetect.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { expectClose } from '../analysis/fixtures';
import { computeLetterbox } from '../inference/letterbox';
import { decodeDetections, nonMaxSuppression } from './decodeDetect';
import { loadCapFixture } from './fixtures';

interface NmsFixture {
  readonly ultralytics: string;
  readonly num_classes: number;
  readonly output: number[];
  readonly expected: { readonly box: number[]; readonly score: number; readonly cls: number }[];
}

interface Anchor {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly scores: Readonly<Record<number, number>>;
}

/** [4+nc][N] の並び（チャンネルが先）で出力を作る */
function makeOutput(numClasses: number, anchors: readonly Anchor[]): Float32Array {
  const n = anchors.length;
  const out = new Float32Array((4 + numClasses) * n);
  anchors.forEach((a, i) => {
    [a.cx, a.cy, a.w, a.h].forEach((v, row) => (out[row * n + i] = v));
    Object.entries(a.scores).forEach(([c, s]) => (out[(4 + Number(c)) * n + i] = s));
  });
  return out;
}

describe('nonMaxSuppression', () => {
  it('ultralytics の non_max_suppression と一致する', () => {
    const fx = loadCapFixture<NmsFixture>('nms');
    const actual = nonMaxSuppression(new Float32Array(fx.output), fx.num_classes).map((d) => ({
      box: [...d.box],
      score: d.score,
      cls: d.cls,
    }));
    expectClose(actual, fx.expected, 1e-3);
  });

  it('同じクラスで重なる枠は信頼度の高い1つだけ残し、違うクラスは両方残す', () => {
    const out = makeOutput(3, [
      { cx: 100, cy: 100, w: 20, h: 20, scores: { 0: 0.9 } },
      { cx: 102, cy: 100, w: 20, h: 20, scores: { 0: 0.8 } },
      { cx: 101, cy: 100, w: 20, h: 20, scores: { 1: 0.7 } },
    ]);
    const got = nonMaxSuppression(out, 3);
    expect(got.map((d) => [d.cls, Math.fround(d.score)])).toEqual([
      [0, Math.fround(0.9)],
      [1, Math.fround(0.7)],
    ]);
  });

  it('信頼度が閾値ちょうどのものは採らない', () => {
    const out = makeOutput(2, [{ cx: 50, cy: 50, w: 10, h: 10, scores: { 0: 0.15 } }]);
    expect(nonMaxSuppression(out, 2)).toEqual([]);
  });

  it('1つのアンカーでは最大のクラスだけを採る（同点は番号の小さい方）', () => {
    const out = makeOutput(3, [{ cx: 50, cy: 50, w: 10, h: 10, scores: { 1: 0.4, 2: 0.4 } }]);
    expect(nonMaxSuppression(out, 3).map((d) => d.cls)).toEqual([1]);
  });

  it('maxDet 件で打ち切る', () => {
    const anchors = [0.9, 0.8, 0.7, 0.6, 0.5].map((s, i) => ({ cx: 50 + i * 100, cy: 50, w: 10, h: 10, scores: { 0: s } }));
    expect(nonMaxSuppression(makeOutput(1, anchors), 1, { maxDet: 3 })).toHaveLength(3);
  });

  it('出力の長さが合わなければ例外にする', () => {
    expect(() => nonMaxSuppression(new Float32Array(16), 11)).toThrow('倍数');
  });
});

describe('decodeDetections', () => {
  it('縦長の動画（1080x1920）ではレターボックスを戻して縦長の表示座標にする', () => {
    const lb = computeLetterbox(1080, 1920, 640); // 360x640 → 横を 384 まで埋める（左に 12）
    const out = makeOutput(1, [{ cx: 192, cy: 320, w: 10, h: 10, scores: { 0: 0.5 } }]);
    const [d] = decodeDetections(out, 1, lb);
    expectClose([...d.box], [525, 945, 555, 975], 1e-6);
  });
});
```

`src/capDetect/records.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Detection } from './decodeDetect';
import { classIds, toFrameRecord } from './records';

const CLASSES = ['cap', 'pitcher_motion', 'batter_stance', 'umpire', 'catcher', 'pitcher_release'];
const ids = classIds(CLASSES);
const det = (cls: number, score: number, box: Detection['box'] = [0, 0, 10, 10]): Detection => ({ box, score, cls });

describe('classIds', () => {
  it('クラス名から番号を引く（並びが違っても名前で決まる）', () => {
    expect(ids).toEqual({ cap: 0, pitcherMotion: 1, pitcherRelease: 5 });
    expect(classIds(['pitcher_release', 'pitcher_motion', 'cap'])).toEqual({ cap: 2, pitcherMotion: 1, pitcherRelease: 0 });
  });

  it('必要なクラスが無ければ例外にする', () => {
    expect(() => classIds(['cap', 'pitcher_motion'])).toThrow('pitcher_release');
  });
});

describe('toFrameRecord', () => {
  it('キャップは信頼度が最も高い1つの中心を採る', () => {
    const r = toFrameRecord(7, [det(0, 0.3, [0, 0, 10, 10]), det(0, 0.6, [100, 200, 110, 220])], ids);
    expect(r.cap).toEqual({ frame: 7, x: 105, y: 210, conf: 0.6 });
  });

  it('投手の状態は、投手の枠のうち信頼度が最も高いもののクラス', () => {
    expect(toFrameRecord(1, [det(1, 0.5), det(5, 0.6)], ids).pitcher).toBe('release');
    expect(toFrameRecord(1, [det(1, 0.7), det(5, 0.6)], ids).pitcher).toBe('motion');
  });

  it('何も無ければキャップも投手も null', () => {
    expect(toFrameRecord(3, [det(3, 0.9)], ids)).toEqual({ frame: 3, cap: null, pitcher: null });
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm vitest run src/capDetect/decodeDetect.test.ts src/capDetect/records.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: decodeDetect.ts を実装する**

`src/capDetect/decodeDetect.ts`:

```ts
/**
 * YOLOv8 検出モデルの出力 [1, 4+nc, N]（NMS 前、チャンネルが先の並び）を検出のリストにする。
 * ultralytics の non_max_suppression と同じ規則:
 * アンカーごとに最大のクラスを1つ採る（同点は番号の小さい方）→ 信頼度が閾値「より大きい」ものだけ残す →
 * クラスごとに IoU > 0.7 の重なりを消す → 信頼度の高い順に最大 300 件。
 */

import { type Letterbox, toSourceX, toSourceY } from '../inference/letterbox';

export const DETECT_CONF = 0.15;
export const NMS_IOU = 0.7;
export const MAX_DET = 300;

/** x1, y1, x2, y2 */
export type Box = readonly [number, number, number, number];

export interface Detection {
  readonly box: Box;
  readonly score: number;
  readonly cls: number;
}

export interface NmsOptions {
  readonly conf?: number;
  readonly iou?: number;
  readonly maxDet?: number;
}

function bestClass(output: Float32Array, n: number, numClasses: number, anchor: number): { cls: number; score: number } {
  let cls = 0;
  let score = output[4 * n + anchor];
  for (let c = 1; c < numClasses; c++) {
    const s = output[(4 + c) * n + anchor];
    if (s > score) {
      cls = c;
      score = s;
    }
  }
  return { cls, score };
}

function candidates(output: Float32Array, numClasses: number, conf: number): Detection[] {
  const rows = 4 + numClasses;
  if (output.length % rows !== 0) throw new Error(`出力の長さが ${rows} の倍数ではありません: ${output.length}`);
  const n = output.length / rows;
  // 出力は float32。ultralytics（torch）は閾値も float32 で比べるので、閾値を float32 に丸めてから比べる
  const threshold = Math.fround(conf);
  const found: Detection[] = [];
  for (let a = 0; a < n; a++) {
    const { cls, score } = bestClass(output, n, numClasses, a);
    if (!(score > threshold)) continue;
    const [cx, cy, w, h] = [output[a], output[n + a], output[2 * n + a], output[3 * n + a]];
    found.push({ box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], score, cls });
  }
  return found;
}

export function iou(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = w * h;
  const area = (r: Box) => (r[2] - r[0]) * (r[3] - r[1]);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

export function nonMaxSuppression(output: Float32Array, numClasses: number, opts: NmsOptions = {}): Detection[] {
  const { conf = DETECT_CONF, iou: iouThreshold = NMS_IOU, maxDet = MAX_DET } = opts;
  const sorted = [...candidates(output, numClasses, conf)].sort((a, b) => b.score - a.score);
  const kept = sorted.reduce<Detection[]>(
    (acc, d) => (acc.some((k) => k.cls === d.cls && iou(k.box, d.box) > iouThreshold) ? acc : [...acc, d]),
    [],
  );
  return kept.slice(0, maxDet);
}

/** NMS をかけ、座標をレターボックス前の表示座標に戻す */
export function decodeDetections(output: Float32Array, numClasses: number, lb: Letterbox, opts?: NmsOptions): Detection[] {
  return nonMaxSuppression(output, numClasses, opts).map((d) => ({
    ...d,
    box: [toSourceX(d.box[0], lb), toSourceY(d.box[1], lb), toSourceX(d.box[2], lb), toSourceY(d.box[3], lb)],
  }));
}
```

- [ ] **Step 4: records.ts を実装する**

`src/capDetect/records.ts`:

```ts
/**
 * 1コマ分の検出から、軌跡に使う情報だけを取り出す（SHARED の pitching_analysis.py と同じ選び方）。
 * - キャップ: 信頼度が最も高い1つの中心。Python 版は画素を整数に切り捨てるが、ここでは小数のまま持つ（設計書 §9.7）
 * - 投手の状態: 投手の枠（pitcher_motion / pitcher_release）のうち、信頼度が最も高い枠のクラス
 */

import { REQUIRED_DETECTOR_CLASSES } from '../inference/manifest';
import type { Detection } from './decodeDetect';

export type PitcherState = 'motion' | 'release' | null;

export interface CapPoint {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly conf: number;
}

/** 推論したコマの記録。推論していないコマは記録しない */
export interface FrameRecord {
  readonly frame: number;
  readonly cap: CapPoint | null;
  readonly pitcher: PitcherState;
}

export interface ClassIds {
  readonly cap: number;
  readonly pitcherMotion: number;
  readonly pitcherRelease: number;
}

export function classIds(classes: readonly string[]): ClassIds {
  const id = (name: (typeof REQUIRED_DETECTOR_CLASSES)[number]) => {
    const i = classes.indexOf(name);
    if (i < 0) throw new Error(`検出モデルに ${name} クラスがありません`);
    return i;
  };
  return { cap: id('cap'), pitcherMotion: id('pitcher_motion'), pitcherRelease: id('pitcher_release') };
}

const highest = (dets: readonly Detection[], keep: (d: Detection) => boolean): Detection | null =>
  dets.filter(keep).reduce<Detection | null>((b, d) => (b === null || d.score > b.score ? d : b), null);

export function toFrameRecord(frame: number, dets: readonly Detection[], ids: ClassIds): FrameRecord {
  const cap = highest(dets, (d) => d.cls === ids.cap);
  const pitcher = highest(dets, (d) => d.cls === ids.pitcherMotion || d.cls === ids.pitcherRelease);
  return {
    frame,
    cap: cap === null ? null : { frame, x: (cap.box[0] + cap.box[2]) / 2, y: (cap.box[1] + cap.box[3]) / 2, conf: cap.score },
    pitcher: pitcher === null ? null : pitcher.cls === ids.pitcherMotion ? 'motion' : 'release',
  };
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `pnpm vitest run src/capDetect/decodeDetect.test.ts src/capDetect/records.test.ts`
Expected: PASS

- fixture との一致だけ落ちる場合: 件数が違えば閾値の比較（`Math.fround`・「より大きい」）とクラスの選び方、順番が違えば並べ替え、座標が 1e-3 を超えてずれれば xywh → xyxy の変換を確かめる

- [ ] **Step 6: コミットする**

```bash
git add src/capDetect/decodeDetect.ts src/capDetect/decodeDetect.test.ts src/capDetect/records.ts src/capDetect/records.test.ts
git commit -m "feat: 検出モデルの出力の解読と NMS、1コマ分の記録（キャップと投手の状態）を追加

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 3コマ差分の強調（enhanced）

**Files:**
- Create: `src/capDetect/enhance.ts`, `src/capDetect/enhance.test.ts`
- Modify: `docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md`（§9.7 に2点追記）

**移植元:** `SHARED/tennis.py` の `run` のループ本体（`absdiff` → `bitwise_and` → ガンマの `LUT` → `addWeighted(frame, 0.4, diff, 0.6, 0)`）。

いまの検出モデル（20250510）は `raw` なので、この経路は配列レベルの一致しか確かめられない。enhanced で学習したモデルに差し替えるときに、実映像で確かめ直す（README に書く。Task 11）。

**Interfaces:**
- Consumes: `loadCapFixture`（Task 2）
- Produces:
  - `GAMMA = 1.5`
  - `gammaLut(gamma?: number): Uint8Array`
  - `interface Rect { x: number; y: number; width: number; height: number }`
  - `enhanceRgba(prev: Uint8ClampedArray, cur: Uint8ClampedArray, next: Uint8ClampedArray, width: number, height: number, rect: Rect): Uint8ClampedArray`

- [ ] **Step 1: テストを先に書く**

`src/capDetect/enhance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { enhanceRgba, gammaLut } from './enhance';
import { loadCapFixture } from './fixtures';

interface EnhanceFixture {
  readonly lut: number[];
  readonly width: number;
  readonly height: number;
  readonly cases: { readonly name: string; readonly prev: number[]; readonly cur: number[]; readonly next: number[]; readonly expected: number[] }[];
}

const fx = loadCapFixture<EnhanceFixture>('enhance');

/** Python の H x W x 3（BGR）を RGBA に詰める。演算はチャンネルごとなので、並びの違いは結果に影響しない */
function toRgba(values: readonly number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray((values.length / 3) * 4);
  for (let i = 0; i < values.length / 3; i++) {
    out.set([values[i * 3], values[i * 3 + 1], values[i * 3 + 2], 255], i * 4);
  }
  return out;
}

const toRgb = (rgba: Uint8ClampedArray) => Array.from(rgba).filter((_, i) => i % 4 !== 3);

describe('Python 版（tennis.py）との一致', () => {
  it('ガンマの変換表', () => {
    expect(Array.from(gammaLut())).toEqual(fx.lut);
  });

  it.each(fx.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const full = { x: 0, y: 0, width: fx.width, height: fx.height };
    const out = enhanceRgba(toRgba(c.prev), toRgba(c.cur), toRgba(c.next), fx.width, fx.height, full);
    expect(toRgb(out)).toEqual(c.expected);
  });
});

describe('enhanceRgba', () => {
  it('rect の外（レターボックスの余白）は元のまま、アルファは 255 のまま', () => {
    const size = 4 * 4 * 4;
    const cur = new Uint8ClampedArray(size).fill(114);
    const moved = new Uint8ClampedArray(size).fill(200);
    const out = enhanceRgba(moved, cur, moved, 4, 4, { x: 1, y: 1, width: 2, height: 2 });
    expect(Array.from(out.slice(0, 4))).toEqual([114, 114, 114, 114]); // (0,0) は余白
    expect(out[(1 * 4 + 1) * 4]).not.toBe(114); // (1,1) は強調される
    expect(out[(1 * 4 + 1) * 4 + 3]).toBe(114); // アルファは cur のまま
  });

  it('画素数が合わなければ例外にする', () => {
    const a = new Uint8ClampedArray(16);
    expect(() => enhanceRgba(a, a, new Uint8ClampedArray(12), 2, 2, { x: 0, y: 0, width: 2, height: 2 })).toThrow('画素数');
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm vitest run src/capDetect/enhance.test.ts`
Expected: FAIL（`./enhance` が無い）

- [ ] **Step 3: 実装する**

`src/capDetect/enhance.ts`:

```ts
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
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm vitest run src/capDetect/enhance.test.ts`
Expected: PASS

- 「ガンマの変換表」だけが 1 か所ずれる場合は、JS と Python の `pow` の末尾の誤差が切り捨てで表に出ている。`gammaLut()` を fixture の `lut` と同じ値の定数表（256 個）に置き換え、コメントに「Python の表をそのまま持つ（pow の誤差で切り捨てがずれるため）」と書く
- 画素が 1 だけずれる場合は丸め方を疑う（`Math.round` を使っていないか。`Uint8ClampedArray` への代入に任せる）

- [ ] **Step 5: 設計書 §9.7 に意図的な違いを2点足す**

`docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md` の §9.7 の 5. の後ろに追加する:

```markdown
6. 差分強調（`enhanced`）は、縮小（レターボックス）した後の画素で行う。Python 版は元の解像度で強調してから縮小する。余白は強調せず 114 のままにする
7. キャップの中心は小数のまま持つ。Python 版は画素を整数に切り捨てる（1px 未満の差）
```

- [ ] **Step 6: コミットする**

```bash
git add src/capDetect/enhance.ts src/capDetect/enhance.test.ts docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md
git commit -m "feat: 3コマ差分の強調（enhanced の前処理）を移植

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: 推論の間引きとリリース候補

**Files:**
- Create: `src/capDetect/gate.ts`, `src/capDetect/gate.test.ts`
- Create: `src/capDetect/release.ts`, `src/capDetect/release.test.ts`

**移植元:** `SHARED/prefilter.py` の `InferenceGate`（`_decide` と `note_detection`。投球区間の窓は使わない＝常に区間内）。`SHARED/pitching_analysis.py` の `detect_release`（直前に処理したコマの状態が motion で、このコマが release なら、このコマがリリース）。

**Interfaces:**
- Consumes: `FrameRecord`（Task 4）
- Produces:
  - `interface GateConfig { searchStride: number; denseFrames: number; lookback: number }`
  - `DEFAULT_GATE: GateConfig`（5 / 30 / 4）
  - `interface GateState { denseUntil: number }`, `INITIAL_GATE: GateState`
  - `shouldInfer(state: GateState, frame: number, config?: GateConfig): boolean`
  - `noteDetection(state: GateState, frame: number, found: boolean, config?: GateConfig): GateState`
  - `expectedInferences(frameCount: number, config?: GateConfig): number`（見積もり用）
  - `findReleaseCandidate(records: readonly FrameRecord[]): number | null`

- [ ] **Step 1: テストを先に書く**

`src/capDetect/gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_GATE, expectedInferences, INITIAL_GATE, noteDetection, shouldInfer } from './gate';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('gate', () => {
  it('見つかるまでは5コマに1回だけ推論する', () => {
    expect(range(12).filter((f) => shouldInfer(INITIAL_GATE, f))).toEqual([0, 5, 10]);
  });

  it('見つけたら、そのコマ + 30 まで連続で推論する', () => {
    const state = noteDetection(INITIAL_GATE, 20, true);
    expect(shouldInfer(state, 21)).toBe(true);
    expect(shouldInfer(state, 50)).toBe(true);
    expect(shouldInfer(state, 51)).toBe(false);
    expect(shouldInfer(state, 55)).toBe(true); // 間引きに戻る
  });

  it('連続の途中でまた見つければ延びる。見つからなければ変わらない', () => {
    const found = noteDetection(noteDetection(INITIAL_GATE, 20, true), 40, true);
    expect(found.denseUntil).toBe(70);
    expect(noteDetection(found, 41, false)).toBe(found);
  });

  it('searchStride が1なら全コマ推論する', () => {
    const every = { ...DEFAULT_GATE, searchStride: 1 };
    expect(range(4).every((f) => shouldInfer(INITIAL_GATE, f, every))).toBe(true);
  });

  it('searchStride が1未満なら例外にする', () => {
    expect(() => shouldInfer(INITIAL_GATE, 0, { ...DEFAULT_GATE, searchStride: 0 })).toThrow('searchStride');
  });

  it('見積もり用の推論回数: 間引きの分 + 連続の分 + 遡りの分（コマ数を超えない）', () => {
    expect(expectedInferences(600)).toBe(120 + 30 + 4);
    expect(expectedInferences(20)).toBe(20);
  });
});
```

`src/capDetect/release.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { FrameRecord, PitcherState } from './records';
import { findReleaseCandidate } from './release';

const rec = (frame: number, pitcher: PitcherState): FrameRecord => ({ frame, cap: null, pitcher });

describe('findReleaseCandidate', () => {
  it('直前に推論したコマが motion で、このコマが release なら、このコマを候補にする', () => {
    expect(findReleaseCandidate([rec(0, 'motion'), rec(5, 'motion'), rec(10, 'release'), rec(15, null)])).toBe(10);
  });

  it('あいだに投手なしのコマがあれば切り替わりとみなさない（Python 版と同じ）', () => {
    expect(findReleaseCandidate([rec(0, 'motion'), rec(5, null), rec(10, 'release')])).toBeNull();
  });

  it('切り替わりが複数あれば最初のものを採る', () => {
    expect(findReleaseCandidate([rec(0, 'motion'), rec(1, 'release'), rec(2, 'motion'), rec(3, 'release')])).toBe(1);
  });

  it('遡って推論した記録が後ろに積まれていても、frame 順で判定する', () => {
    // 10 でキャップを見つけ、6〜9 を遡って推論した順に積まれている
    const records = [rec(0, 'motion'), rec(5, 'motion'), rec(10, 'release'), rec(6, 'motion'), rec(7, 'motion'), rec(8, 'motion'), rec(9, 'release')];
    expect(findReleaseCandidate(records)).toBe(9);
  });

  it('切り替わりが無ければ null', () => {
    expect(findReleaseCandidate([rec(0, 'release'), rec(5, 'release')])).toBeNull();
    expect(findReleaseCandidate([])).toBeNull();
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm vitest run src/capDetect/gate.test.ts src/capDetect/release.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`src/capDetect/gate.ts`:

```ts
/**
 * 推論の間引き（SHARED の prefilter.py の InferenceGate の移植。投球区間の窓は使わない＝常に区間内）。
 * キャップが見つかるまでは searchStride コマに1回だけ推論し、見つけたら denseFrames のあいだ連続で推論する。
 * 見つけたときに直前の推論していないコマ（最大 lookback）を遡って推論するのは、この計画で足した動き（detectLoop.ts が行う）。
 */

export interface GateConfig {
  readonly searchStride: number;
  readonly denseFrames: number;
  readonly lookback: number;
}

export const DEFAULT_GATE: GateConfig = { searchStride: 5, denseFrames: 30, lookback: 4 };

export interface GateState {
  readonly denseUntil: number;
}

export const INITIAL_GATE: GateState = { denseUntil: -1 };

export function shouldInfer(state: GateState, frame: number, config: GateConfig = DEFAULT_GATE): boolean {
  if (config.searchStride < 1) throw new Error('searchStride は1以上である必要があります');
  return frame <= state.denseUntil || frame % config.searchStride === 0;
}

export function noteDetection(state: GateState, frame: number, found: boolean, config: GateConfig = DEFAULT_GATE): GateState {
  return found ? { denseUntil: frame + config.denseFrames } : state;
}

/** 見積もり用: 間引きの分 + 見つけた後の連続の分 + 遡りの分（コマ数を超えない） */
export function expectedInferences(frameCount: number, config: GateConfig = DEFAULT_GATE): number {
  return Math.min(frameCount, Math.ceil(frameCount / config.searchStride) + config.denseFrames + config.lookback);
}
```

`src/capDetect/release.ts`:

```ts
/**
 * リリース候補（SHARED の pitching_analysis.py の detect_release の移植）。
 * 直前に推論したコマの投手の状態が motion で、このコマが release なら、このコマをリリースとする。
 * 遡って推論した記録は処理の順番が前後するので、必ず frame 順に並べてから見る。
 * 1球分の動画なので、切り替わりが複数あれば最初のものを採る。
 */

import type { FrameRecord } from './records';

export function findReleaseCandidate(records: readonly FrameRecord[]): number | null {
  const sorted = [...records].sort((a, b) => a.frame - b.frame);
  const hit = sorted.find((r, i) => i > 0 && sorted[i - 1].pitcher === 'motion' && r.pitcher === 'release');
  return hit?.frame ?? null;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm vitest run src/capDetect/gate.test.ts src/capDetect/release.test.ts`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add src/capDetect/gate.ts src/capDetect/gate.test.ts src/capDetect/release.ts src/capDetect/release.test.ts
git commit -m "feat: 推論の間引きとリリース候補を移植

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 記録から軌跡と球速を出す・書き出す JSON

**Files:**
- Create: `src/capDetect/syntheticThrow.ts`（テスト用の合成投球）
- Create: `src/capDetect/analyzeThrow.ts`, `src/capDetect/analyzeThrow.test.ts`
- Create: `src/capDetect/trajectoryJson.ts`, `src/capDetect/trajectoryJson.test.ts`

**移植元:** `SHARED/trajectory_fitter.py` の `analyze_pitch`（組み立て部分）。ゾーン・コースは作らない。

**Interfaces:**
- Consumes: `ransacFit`, `interpolateGaps`, `estimateSpeedKmh`, `FitError`, `INLIER_THRESHOLD_RATIO`, `MIN_POINTS_FOR_FIT`, `FitResult`, `CompletedPoint`（Task 3）、`FrameRecord`, `CapPoint`（Task 4）
- Produces:
  - `syntheticThrow(opts?: SyntheticThrowOptions): FrameRecord[]`、`SYNTH_WIDTH = 1920`, `SYNTH_HEIGHT = 1080`, `SYNTH_FPS = 60`, `SYNTH_RELEASE = 100`
  - `SPEED_RANGE_KMH = { min: 30, max: 150 }`
  - `type ThrowProblem = 'too_few' | 'too_few_after_release'`
  - `interface ThrowInput { records: readonly FrameRecord[]; fps: number; frameHeight: number; releaseFrame: number | null }`
  - `interface ThrowAnalysis { originFrame: number | null; detections: readonly CapPoint[]; fit: FitResult | null; trajectory: readonly CompletedPoint[]; speedKmh: number | null; speedSuspicious: boolean; problem: ThrowProblem | null }`
  - `analyzeThrow(input: ThrowInput): ThrowAnalysis`
  - `type ReleaseSource = 'auto' | 'manual' | 'none'`
  - `interface TrajectoryJsonInput { fileName: string; fps: number; width: number; height: number; frameCount: number; model: { weights: string; imgsz: number; preprocess: 'raw' | 'enhanced' }; releaseFrame: number | null; releaseSource: ReleaseSource; records: readonly FrameRecord[]; analysis: ThrowAnalysis }`
  - `interface TrajectoryJson`（設計書 §9.5 の形）
  - `toTrajectoryJson(input: TrajectoryJsonInput): TrajectoryJson`
  - `inferredRanges(frames: readonly number[]): [number, number][]`（end は含まない）
  - `trajectoryJsonFileName(videoName: string): string`

- [ ] **Step 1: 合成投球を書く**

`src/capDetect/syntheticThrow.ts`:

```ts
/**
 * テスト用の合成投球（実在の映像は使わない）。
 * リリース前は投手が motion、リリースのコマから 5 コマは release、その後キャップが放物線を描いて飛ぶ。
 * 推論したコマの記録だけを frame 順に返す。テストからだけ使う。
 */

import type { FrameRecord, PitcherState } from './records';

export const SYNTH_WIDTH = 1920;
export const SYNTH_HEIGHT = 1080;
export const SYNTH_FPS = 60;
export const SYNTH_RELEASE = 100;

export interface SyntheticThrowOptions {
  /** 飛んでいるコマ数（既定 24 = 0.4 秒） */
  readonly flightFrames?: number;
  readonly frameCount?: number;
  /** キャップを見失うコマ */
  readonly missing?: readonly number[];
  /** 誤検出にするコマ（軌跡から大きく外れた位置） */
  readonly outliers?: readonly number[];
  /** リリース前に、投手の手の中のキャップを拾うコマ */
  readonly capInHand?: readonly number[];
  /** 推論したコマ（既定: 全コマ） */
  readonly inferred?: (frame: number) => boolean;
  /** 検出位置のずれ（コマごと） */
  readonly jitter?: (frame: number) => readonly [number, number];
}

export function capPosition(t: number): [number, number] {
  return [900 + 300 * t - 50 * t * t, 400 + 200 * t + 600 * t * t];
}

function pitcherAt(frame: number): PitcherState {
  if (frame < SYNTH_RELEASE) return 'motion';
  return frame < SYNTH_RELEASE + 5 ? 'release' : null;
}

function capAt(frame: number, o: SyntheticThrowOptions): FrameRecord['cap'] {
  const flight = o.flightFrames ?? 24;
  if (o.capInHand?.includes(frame)) return { frame, x: 500, y: 600, conf: 0.4 };
  const flying = frame > SYNTH_RELEASE && frame <= SYNTH_RELEASE + flight && !o.missing?.includes(frame);
  if (!flying) return null;
  const [x, y] = capPosition((frame - SYNTH_RELEASE) / SYNTH_FPS);
  const [dx, dy] = o.outliers?.includes(frame) ? [300, -200] : (o.jitter?.(frame) ?? [0, 0]);
  return { frame, x: x + dx, y: y + dy, conf: 0.5 };
}

export function syntheticThrow(o: SyntheticThrowOptions = {}): FrameRecord[] {
  return Array.from({ length: o.frameCount ?? 200 }, (_, frame) => frame)
    .filter((frame) => o.inferred?.(frame) ?? true)
    .map((frame) => ({ frame, cap: capAt(frame, o), pitcher: pitcherAt(frame) }));
}
```

- [ ] **Step 2: analyzeThrow のテストを先に書く**

`src/capDetect/analyzeThrow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { analyzeThrow } from './analyzeThrow';
import { SYNTH_FPS, SYNTH_HEIGHT, SYNTH_RELEASE, syntheticThrow } from './syntheticThrow';

const base = { fps: SYNTH_FPS, frameHeight: SYNTH_HEIGHT, releaseFrame: SYNTH_RELEASE };
const SPEED = (9.22 / (23 / 60)) * 3.6; // 101〜124 コマ（t = 1/60 〜 24/60）

describe('analyzeThrow', () => {
  it('きれいな投球: リリースを原点に軌跡と球速を出す', () => {
    const a = analyzeThrow({ ...base, records: syntheticThrow() });
    expect(a.problem).toBeNull();
    expect(a.originFrame).toBe(SYNTH_RELEASE);
    expect(a.speedKmh).toBeCloseTo(SPEED, 6);
    expect(a.speedSuspicious).toBe(false);
    expect(a.trajectory.map((p) => p.frame)).toEqual(Array.from({ length: 24 }, (_, i) => 101 + i));
  });

  it('見失ったコマは補い、誤検出は除く', () => {
    const a = analyzeThrow({ ...base, records: syntheticThrow({ missing: [105, 106], outliers: [110, 118] }) });
    expect(a.trajectory.filter((p) => p.interpolated).map((p) => p.frame)).toEqual([105, 106, 110, 118]);
    expect(a.fit?.outliers.map((p) => p.frame)).toEqual([110, 118]);
  });

  it('リリースより前の手の中のキャップは使わない', () => {
    const a = analyzeThrow({ ...base, records: syntheticThrow({ capInHand: [90, 92, 94, 96, 98] }) });
    const used = [...(a.fit?.inliers ?? []), ...(a.fit?.outliers ?? [])].map((p) => p.frame);
    expect(used.some((f) => f < SYNTH_RELEASE)).toBe(false);
    expect(a.detections.filter((d) => d.frame < SYNTH_RELEASE)).toHaveLength(5); // 表示用には残る
    expect(a.speedKmh).toBeCloseTo(SPEED, 6);
  });

  it('リリースが分からなければ最初の検出を原点にする（球速は変わらない）', () => {
    const a = analyzeThrow({ ...base, releaseFrame: null, records: syntheticThrow() });
    expect(a.originFrame).toBe(101);
    expect(a.speedKmh).toBeCloseTo(SPEED, 6);
  });

  it('リリースを最後の検出より後にすると、落ちずに「リリースより後が足りない」を返す', () => {
    const a = analyzeThrow({ ...base, releaseFrame: 150, records: syntheticThrow() });
    expect(a.problem).toBe('too_few_after_release');
    expect(a.fit).toBeNull();
    expect(a.speedKmh).toBeNull();
  });

  it('キャップが1つも見つからなければ「見つけられない」', () => {
    const a = analyzeThrow({ ...base, releaseFrame: null, records: syntheticThrow({ flightFrames: 0 }) });
    expect(a.problem).toBe('too_few');
    expect(a.originFrame).toBeNull();
  });

  it('球速が 30〜150 km/h を外れたら注記の印を付ける', () => {
    const a = analyzeThrow({ ...base, records: syntheticThrow({ flightFrames: 6 }) }); // 約 400 km/h
    expect(a.problem).toBeNull();
    expect(a.speedSuspicious).toBe(true);
  });

  it('外れ値の閾値は画面の高さで決まる（縦長の動画では高さが大きい）', () => {
    const jitter = (f: number) => [0, f % 2 === 0 ? 10 : -10] as const;
    const records = syntheticThrow({ jitter });
    expect(analyzeThrow({ ...base, frameHeight: 1920, records }).fit?.outliers).toEqual([]); // 閾値 28.8px
    // 閾値 7.2px: 偶数コマと奇数コマが別々の放物線に見え、片方が外れ値になる
    expect(analyzeThrow({ ...base, frameHeight: 480, records }).fit?.outliers.length).toBeGreaterThan(0);
  });

  it('記録の並びが frame 順でなくても同じ結果になる', () => {
    const records = syntheticThrow({ missing: [107] });
    const shuffled = [...records.slice(120), ...records.slice(0, 120)];
    expect(analyzeThrow({ ...base, records: shuffled })).toEqual(analyzeThrow({ ...base, records }));
  });

  it('fps や画面の高さが正でなければ例外にする', () => {
    expect(() => analyzeThrow({ ...base, fps: 0, records: [] })).toThrow('fps');
  });
});
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `pnpm vitest run src/capDetect/analyzeThrow.test.ts`
Expected: FAIL（`./analyzeThrow` が無い）

- [ ] **Step 4: analyzeThrow を実装する**

`src/capDetect/analyzeThrow.ts`:

```ts
/**
 * 推論したコマの記録から、1球分の軌跡と平均球速を出す（SHARED の trajectory_fitter.py の analyze_pitch の組み立て部分）。
 * - 原点（t=0）はリリースのコマ。無ければ最初の検出
 * - リリースが分かっていれば、そのコマより前の検出は使わない（手の中のキャップを拾うため）。表示用の detections には残す
 * - フィットできなければ problem を返す（例外にしない）。画面が案内を出す
 */

import type { CapPoint, FrameRecord } from './records';
import {
  type CompletedPoint,
  estimateSpeedKmh,
  FitError,
  type FitResult,
  INLIER_THRESHOLD_RATIO,
  interpolateGaps,
  ransacFit,
} from './trajectory';

export const SPEED_RANGE_KMH = { min: 30, max: 150 } as const;

export type ThrowProblem = 'too_few' | 'too_few_after_release';

export interface ThrowInput {
  readonly records: readonly FrameRecord[];
  readonly fps: number;
  readonly frameHeight: number;
  readonly releaseFrame: number | null;
}

export interface ThrowAnalysis {
  readonly originFrame: number | null;
  /** キャップを検出したコマ（frame 順。リリース前も含む） */
  readonly detections: readonly CapPoint[];
  readonly fit: FitResult | null;
  readonly trajectory: readonly CompletedPoint[];
  readonly speedKmh: number | null;
  readonly speedSuspicious: boolean;
  readonly problem: ThrowProblem | null;
}

export function analyzeThrow({ records, fps, frameHeight, releaseFrame }: ThrowInput): ThrowAnalysis {
  if (!(fps > 0) || !(frameHeight > 0)) {
    throw new Error(`fps と画面の高さは正の値が必要です（fps=${fps}, height=${frameHeight}）`);
  }
  const detections = [...records].sort((a, b) => a.frame - b.frame).flatMap((r) => (r.cap ? [r.cap] : []));
  const used = releaseFrame === null ? detections : detections.filter((d) => d.frame >= releaseFrame);
  const originFrame = releaseFrame ?? detections[0]?.frame ?? null;
  const base = { originFrame, detections, fit: null, trajectory: [], speedKmh: null, speedSuspicious: false };
  const points = used.map((d) => ({ frame: d.frame, t: (d.frame - (originFrame ?? 0)) / fps, x: d.x, y: d.y }));
  try {
    const fit = ransacFit(points, frameHeight * INLIER_THRESHOLD_RATIO);
    const speedKmh = estimateSpeedKmh(fit);
    return {
      ...base,
      fit,
      trajectory: interpolateGaps(fit, fps),
      speedKmh,
      speedSuspicious: speedKmh < SPEED_RANGE_KMH.min || speedKmh > SPEED_RANGE_KMH.max,
      problem: null,
    };
  } catch (error) {
    if (!(error instanceof FitError)) throw error;
    const excluded = releaseFrame !== null && used.length < detections.length;
    return { ...base, problem: excluded ? 'too_few_after_release' : 'too_few' };
  }
}
```

- [ ] **Step 5: analyzeThrow のテストが通ることを確かめる**

Run: `pnpm vitest run src/capDetect/analyzeThrow.test.ts`
Expected: PASS

- [ ] **Step 6: trajectoryJson のテストを先に書く**

`src/capDetect/trajectoryJson.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { analyzeThrow } from './analyzeThrow';
import { SYNTH_FPS, SYNTH_HEIGHT, SYNTH_RELEASE, SYNTH_WIDTH, syntheticThrow } from './syntheticThrow';
import { inferredRanges, toTrajectoryJson, trajectoryJsonFileName, type TrajectoryJsonInput } from './trajectoryJson';

function input(over: Partial<TrajectoryJsonInput> = {}): TrajectoryJsonInput {
  const records = syntheticThrow({ inferred: (f) => f % 5 === 0 || (f >= 96 && f <= 130) });
  const releaseFrame = over.releaseFrame === undefined ? SYNTH_RELEASE : over.releaseFrame;
  return {
    fileName: 'clip.mov',
    fps: SYNTH_FPS,
    width: SYNTH_WIDTH,
    height: SYNTH_HEIGHT,
    frameCount: 200,
    model: { weights: 'yolo8m_20250510.pt', imgsz: 640, preprocess: 'raw' },
    releaseFrame,
    releaseSource: releaseFrame === null ? 'none' : 'auto',
    records,
    analysis: analyzeThrow({ records, fps: SYNTH_FPS, frameHeight: SYNTH_HEIGHT, releaseFrame }),
    ...over,
  };
}

describe('inferredRanges', () => {
  it('推論したコマを [start, end) の範囲にまとめる（並びや重複があっても）', () => {
    expect(inferredRanges([10, 0, 5, 6, 7, 6])).toEqual([[0, 1], [5, 8], [10, 11]]);
    expect(inferredRanges([])).toEqual([]);
  });
});

describe('toTrajectoryJson', () => {
  it('設計書 §9.5 の形で書き出す', () => {
    const json = toTrajectoryJson(input());
    expect(json.schema).toBe('cap-pose-lab/trajectory');
    expect(json.version).toBe(1);
    expect(json.video).toEqual({ file: 'clip.mov', fps: 60, width: 1920, height: 1080, frameCount: 200 });
    expect(json.model).toEqual({ weights: 'yolo8m_20250510.pt', imgsz: 640, preprocess: 'raw', conf: 0.15 });
    expect(json.release).toEqual({ frame: 100, source: 'auto' });
    expect(json.inferredFrames[0]).toEqual([0, 1]);
    expect(json.detections).toHaveLength(24);
    expect(json.fit?.inlierFrames).toHaveLength(24);
    expect(json.trajectory.every((p) => typeof p.interpolated === 'boolean')).toBe(true);
    expect(json.speedKmh).toBe(86.6);
  });

  it('フィットできなければ fit と speedKmh は null', () => {
    const json = toTrajectoryJson(input({ releaseFrame: 190 }));
    expect(json.fit).toBeNull();
    expect(json.speedKmh).toBeNull();
    expect(json.trajectory).toEqual([]);
  });

  it('リリースが無ければ source は none', () => {
    expect(toTrajectoryJson(input({ releaseFrame: null })).release).toEqual({ frame: null, source: 'none' });
  });

  it('JSON にして読み戻せる（NaN や undefined を含まない）', () => {
    const json = toTrajectoryJson(input());
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});

describe('trajectoryJsonFileName', () => {
  it('動画名の拡張子を _trajectory.json に替える', () => {
    expect(trajectoryJsonFileName('IMG_0001.MOV')).toBe('IMG_0001_trajectory.json');
  });
});
```

- [ ] **Step 7: テストが落ちることを確かめる**

Run: `pnpm vitest run src/capDetect/trajectoryJson.test.ts`
Expected: FAIL（`./trajectoryJson` が無い）

- [ ] **Step 8: trajectoryJson を実装する**

`src/capDetect/trajectoryJson.ts`:

```ts
/**
 * 書き出す JSON（設計書 §9.5）。座標は表示ピクセル、t は原点からの秒数。
 * 係数は再現できるよう丸めずに出し、それ以外は読みやすい桁に丸める。
 */

import type { ThrowAnalysis } from './analyzeThrow';
import { DETECT_CONF } from './decodeDetect';
import type { CapPoint, FrameRecord } from './records';
import type { CompletedPoint } from './trajectory';

export type ReleaseSource = 'auto' | 'manual' | 'none';

export interface TrajectoryJsonInput {
  readonly fileName: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly model: { readonly weights: string; readonly imgsz: number; readonly preprocess: 'raw' | 'enhanced' };
  readonly releaseFrame: number | null;
  readonly releaseSource: ReleaseSource;
  readonly records: readonly FrameRecord[];
  readonly analysis: ThrowAnalysis;
}

export interface TrajectoryJson {
  readonly schema: 'cap-pose-lab/trajectory';
  readonly version: 1;
  readonly video: { readonly file: string; readonly fps: number; readonly width: number; readonly height: number; readonly frameCount: number };
  readonly model: { readonly weights: string; readonly imgsz: number; readonly preprocess: 'raw' | 'enhanced'; readonly conf: number };
  readonly release: { readonly frame: number | null; readonly source: ReleaseSource };
  readonly detections: readonly CapPoint[];
  readonly inferredFrames: readonly (readonly [number, number])[];
  readonly fit: {
    readonly coeffsX: readonly number[];
    readonly coeffsY: readonly number[];
    readonly rmse: number;
    readonly inlierFrames: readonly number[];
    readonly outlierFrames: readonly number[];
  } | null;
  readonly trajectory: readonly CompletedPoint[];
  readonly speedKmh: number | null;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

export function inferredRanges(frames: readonly number[]): [number, number][] {
  const sorted = [...new Set(frames)].sort((a, b) => a - b);
  return sorted.reduce<[number, number][]>((ranges, f) => {
    const last = ranges[ranges.length - 1];
    return last && last[1] === f ? [...ranges.slice(0, -1), [last[0], f + 1]] : [...ranges, [f, f + 1]];
  }, []);
}

export function toTrajectoryJson(input: TrajectoryJsonInput): TrajectoryJson {
  const { analysis: a } = input;
  const byFrame = (p: { frame: number }) => p.frame;
  return {
    schema: 'cap-pose-lab/trajectory',
    version: 1,
    video: { file: input.fileName, fps: input.fps, width: input.width, height: input.height, frameCount: input.frameCount },
    // manifest の項目をそのまま広げない（書き出すのはこの4つだけ）
    model: { weights: input.model.weights, imgsz: input.model.imgsz, preprocess: input.model.preprocess, conf: DETECT_CONF },
    release: { frame: input.releaseFrame, source: input.releaseFrame === null ? 'none' : input.releaseSource },
    detections: a.detections.map((d) => ({ frame: d.frame, x: round(d.x, 2), y: round(d.y, 2), conf: round(d.conf, 3) })),
    inferredFrames: inferredRanges(input.records.map(byFrame)),
    fit: a.fit && {
      coeffsX: [...a.fit.coeffsX],
      coeffsY: [...a.fit.coeffsY],
      rmse: round(a.fit.rmse, 2),
      inlierFrames: a.fit.inliers.map(byFrame).sort((x, y) => x - y),
      outlierFrames: a.fit.outliers.map(byFrame).sort((x, y) => x - y),
    },
    trajectory: a.trajectory.map((p) => ({ frame: p.frame, t: round(p.t, 4), x: round(p.x, 2), y: round(p.y, 2), interpolated: p.interpolated })),
    speedKmh: a.speedKmh === null ? null : round(a.speedKmh, 1),
  };
}

export function trajectoryJsonFileName(videoName: string): string {
  return `${videoName.replace(/\.[^.]+$/, '')}_trajectory.json`;
}
```

- [ ] **Step 9: テストが通ることを確かめる**

Run: `pnpm vitest run src/capDetect/analyzeThrow.test.ts src/capDetect/trajectoryJson.test.ts`
Expected: PASS

- [ ] **Step 10: コミットする**

```bash
git add src/capDetect/syntheticThrow.ts src/capDetect/analyzeThrow.ts src/capDetect/analyzeThrow.test.ts src/capDetect/trajectoryJson.ts src/capDetect/trajectoryJson.test.ts
git commit -m "feat: 検出の記録から軌跡と平均球速を出し、trajectory.json に書き出す

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: 推論ループの段取りと、1本分の検出

**Files:**
- Create: `src/capDetect/detectLoop.ts`, `src/capDetect/detectLoop.test.ts`
- Create: `src/inference/runDetect.ts`（ブラウザ依存。カバレッジ対象外）
- Modify: `src/inference/frameCanvas.ts`（`toRgba` を足し、`toTensor` はそれを使う）

**Interfaces:**
- Consumes: `DEFAULT_GATE`, `GateConfig`, `INITIAL_GATE`, `shouldInfer`, `noteDetection`（Task 6）、`FrameRecord`, `classIds`, `toFrameRecord`（Task 4）、`decodeDetections`（Task 4）、`enhanceRgba`, `Rect`（Task 5）、`CapDetector`（Task 1）、`decodeFrames`, `DemuxedVideo`（`videoSource.ts`）、`FramePreprocessor`, `makeThumbnail`, `displaySize`（`frameCanvas.ts`）、`rgbaToChw`, `Letterbox`（`letterbox.ts`）、`runPose`（`ortSession.ts`）、`estimateRemainingMs`（`eta.ts`）
- Produces:
  - `interface LoopFrame<I, M> { index: number; input: I; image: M }`
  - `interface FrameImage<M> { frame: number; image: M }`
  - `interface RgbaInput { rgba: Uint8ClampedArray; width: number; height: number; content: Rect }`
  - `runDetectLoop<I, M>(frames: AsyncIterable<LoopFrame<I, M>>, deps: { detect: (frame: number, input: I) => Promise<FrameRecord>; disposeImage: (image: M) => void; gate?: GateConfig; signal?: AbortSignal }): Promise<{ records: FrameRecord[]; images: FrameImage<M>[] }>`（どちらも frame 順）
  - `withEnhancement<I extends RgbaInput, M>(frames: AsyncIterable<LoopFrame<I, M>>, disposeImage: (image: M) => void): AsyncGenerator<LoopFrame<I, M>>`
  - `FramePreprocessor.toRgba(frame: VideoFrame): { rgba: Uint8ClampedArray; letterbox: Letterbox }`
  - `interface DetectRun { fileName: string; fps: number; width: number; height: number; frameCount: number; records: readonly FrameRecord[]; images: readonly FrameImage<ImageBitmap>[]; msPerInference: number }`
  - `analyzeDetectVideo(video: DemuxedVideo, fileName: string, session: InferenceSession, detector: CapDetector, opts: { onProgress: (done: number, total: number, etaMs: number | null) => void; signal: AbortSignal }): Promise<DetectRun>`

- [ ] **Step 1: テストを先に書く**

`src/capDetect/detectLoop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { runDetectLoop, withEnhancement, type LoopFrame, type RgbaInput } from './detectLoop';
import { enhanceRgba } from './enhance';
import type { FrameRecord } from './records';

interface Img {
  readonly id: number;
}

async function* framesOf(n: number): AsyncGenerator<LoopFrame<number, Img>> {
  for (let i = 0; i < n; i++) yield { index: i, input: i, image: { id: i } };
}

/** capFrames のコマでキャップを見つける検出。処理した順を order に残す */
function fakeDetect(capFrames: ReadonlySet<number>, order: number[]) {
  return async (frame: number): Promise<FrameRecord> => {
    order.push(frame);
    return { frame, cap: capFrames.has(frame) ? { frame, x: 0, y: 0, conf: 0.5 } : null, pitcher: null };
  };
}

function tracker() {
  const disposed: number[] = [];
  return { disposed, disposeImage: (m: Img) => disposed.push(m.id) };
}

describe('runDetectLoop', () => {
  it('キャップが無ければ5コマに1回だけ推論し、推論しなかったコマの画像は閉じる', async () => {
    const t = tracker();
    const result = await runDetectLoop(framesOf(12), { detect: fakeDetect(new Set(), []), disposeImage: t.disposeImage });
    expect(result.records.map((r) => r.frame)).toEqual([0, 5, 10]);
    expect(result.images.map((i) => i.frame)).toEqual([0, 5, 10]);
    expect(t.disposed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 11]);
  });

  it('見つけたら直前の4コマを遡って推論し、記録と画像は frame 順で返す', async () => {
    const order: number[] = [];
    const t = tracker();
    const result = await runDetectLoop(framesOf(25), { detect: fakeDetect(new Set([20]), order), disposeImage: t.disposeImage });
    expect(order.slice(0, 9)).toEqual([0, 5, 10, 15, 20, 16, 17, 18, 19]); // 処理の順は前後する
    expect(result.records.map((r) => r.frame)).toEqual([0, 5, 10, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(result.images.map((i) => i.frame)).toEqual(result.records.map((r) => r.frame));
    expect(t.disposed).not.toContain(16);
  });

  it('連続で推論している間に見つけても、遡りは起きない（すでに推論済み）', async () => {
    const order: number[] = [];
    await runDetectLoop(framesOf(30), { detect: fakeDetect(new Set([10, 12]), order), disposeImage: () => undefined });
    expect(order.filter((f) => f === 11)).toHaveLength(1);
  });

  it('lookback が 0 なら遡らない', async () => {
    const order: number[] = [];
    await runDetectLoop(framesOf(12), {
      detect: fakeDetect(new Set([10]), order),
      disposeImage: () => undefined,
      gate: { searchStride: 5, denseFrames: 30, lookback: 0 },
    });
    expect(order).toEqual([0, 5, 10, 11]);
  });

  it('中止したら、それまでに受け取った画像をすべて閉じて止まる', async () => {
    const controller = new AbortController();
    const t = tracker();
    const detect = async (frame: number): Promise<FrameRecord> => {
      if (frame === 10) controller.abort();
      return { frame, cap: null, pitcher: null };
    };
    const run = runDetectLoop(framesOf(20), { detect, disposeImage: t.disposeImage, signal: controller.signal });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(t.disposed.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('推論が失敗したら、失敗したコマを含めて画像を閉じて例外を伝える', async () => {
    const t = tracker();
    const detect = async (frame: number): Promise<FrameRecord> => {
      if (frame === 5) throw new Error('推論失敗');
      return { frame, cap: null, pitcher: null };
    };
    await expect(runDetectLoop(framesOf(8), { detect, disposeImage: t.disposeImage })).rejects.toThrow('推論失敗');
    expect(t.disposed.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('withEnhancement', () => {
  const content = { x: 0, y: 0, width: 1, height: 1 };
  const px = (v: number) => new Uint8ClampedArray([v, v, v, 255]);
  async function* rgbaFrames(values: readonly number[]): AsyncGenerator<LoopFrame<RgbaInput, Img>> {
    for (const [i, v] of values.entries()) yield { index: i, input: { rgba: px(v), width: 1, height: 1, content }, image: { id: i } };
  }

  it('前後のコマで強調し、先頭は prev = cur、末尾のコマは流さずに画像を閉じる', async () => {
    const t = tracker();
    const out: LoopFrame<RgbaInput, Img>[] = [];
    for await (const f of withEnhancement(rgbaFrames([10, 60, 200, 90]), t.disposeImage)) out.push(f);
    expect(out.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(Array.from(out[0].input.rgba)).toEqual(Array.from(enhanceRgba(px(10), px(10), px(60), 1, 1, content)));
    expect(Array.from(out[1].input.rgba)).toEqual(Array.from(enhanceRgba(px(10), px(60), px(200), 1, 1, content)));
    expect(t.disposed).toEqual([3]);
  });

  it('途中でやめたら、まだ流していないコマの画像を閉じる', async () => {
    const t = tracker();
    for await (const f of withEnhancement(rgbaFrames([10, 60, 200]), t.disposeImage)) {
      expect(f.index).toBe(0);
      break;
    }
    expect(t.disposed).toEqual([1]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm vitest run src/capDetect/detectLoop.test.ts`
Expected: FAIL（`./detectLoop` が無い）

- [ ] **Step 3: detectLoop を実装する**

`src/capDetect/detectLoop.ts`:

```ts
/**
 * 1本分の検出の段取り（ブラウザに依存しない。ブラウザ側は inference/runDetect.ts）。
 * - 推論するかどうかは gate.ts で決める
 * - キャップを見つけたら、手元に残しておいた直前の推論していないコマ（最大 lookback）を遡って推論する
 * - 推論したコマだけ画像を残し、残さない画像はその場で閉じる。失敗・中止のときは受け取った画像をすべて閉じる
 * - 記録と画像は frame 順に並べて返す（遡った分で処理の順番が前後するため）
 */

import { enhanceRgba, type Rect } from './enhance';
import { DEFAULT_GATE, type GateConfig, INITIAL_GATE, noteDetection, shouldInfer } from './gate';
import type { FrameRecord } from './records';

export interface LoopFrame<I, M> {
  readonly index: number;
  readonly input: I;
  readonly image: M;
}

export interface FrameImage<M> {
  readonly frame: number;
  readonly image: M;
}

/** レターボックス済みの RGBA。content は余白を除いた映像の範囲 */
export interface RgbaInput {
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly content: Rect;
}

export interface DetectLoopDeps<I, M> {
  readonly detect: (frame: number, input: I) => Promise<FrameRecord>;
  readonly disposeImage: (image: M) => void;
  readonly gate?: GateConfig;
  readonly signal?: AbortSignal;
}

const byFrame = <T extends { frame: number }>(items: readonly T[]) => [...items].sort((a, b) => a.frame - b.frame);

export async function runDetectLoop<I, M>(
  frames: AsyncIterable<LoopFrame<I, M>>,
  deps: DetectLoopDeps<I, M>,
): Promise<{ records: FrameRecord[]; images: FrameImage<M>[] }> {
  const config = deps.gate ?? DEFAULT_GATE;
  const records: FrameRecord[] = [];
  const images: FrameImage<M>[] = [];
  let held: LoopFrame<I, M>[] = [];
  let gate = INITIAL_GATE;
  const infer = async (f: LoopFrame<I, M>) => {
    images.push({ frame: f.index, image: f.image }); // 先に持ち主を移す（推論が失敗しても閉じられるように）
    const record = await deps.detect(f.index, f.input);
    records.push(record);
    return record;
  };
  try {
    for await (const f of frames) {
      if (deps.signal?.aborted) {
        deps.disposeImage(f.image); // 受け取ったばかりで、まだ誰も持っていない
        deps.signal.throwIfAborted();
      }
      if (!shouldInfer(gate, f.index, config)) {
        const next = [...held, f];
        const drop = Math.max(0, next.length - config.lookback);
        next.slice(0, drop).forEach((h) => deps.disposeImage(h.image));
        held = next.slice(drop);
        continue;
      }
      const record = await infer(f);
      gate = noteDetection(gate, f.index, record.cap !== null, config);
      const back = record.cap ? held.filter((h) => h.index >= f.index - config.lookback) : [];
      held.filter((h) => !back.includes(h)).forEach((h) => deps.disposeImage(h.image));
      held = back;
      while (held.length > 0) {
        const [h, ...rest] = held;
        await infer(h);
        held = rest;
      }
    }
  } catch (error) {
    [...held.map((h) => h.image), ...images.map((i) => i.image)].forEach(deps.disposeImage);
    throw error;
  }
  held.forEach((h) => deps.disposeImage(h.image));
  return { records: byFrame(records), images: byFrame(images) };
}

/**
 * enhanced 用: 各コマを前後のコマとの差分で強調して流す（tennis.run と同じ並び）。
 * 先頭は prev = cur、末尾のコマは流さずに画像を閉じる。途中でやめたときも、まだ流していないコマの画像を閉じる。
 */
export async function* withEnhancement<I extends RgbaInput, M>(
  frames: AsyncIterable<LoopFrame<I, M>>,
  disposeImage: (image: M) => void,
): AsyncGenerator<LoopFrame<I, M>> {
  let prev: LoopFrame<I, M> | null = null;
  let cur: LoopFrame<I, M> | null = null;
  try {
    for await (const next of frames) {
      const before = prev;
      const current = cur;
      prev = cur;
      cur = next; // 流す前に持ち替える（やめたときに閉じる対象を next にするため）
      if (!current) continue;
      const { rgba, width, height, content } = current.input;
      const enhanced = enhanceRgba((before ?? current).input.rgba, rgba, next.input.rgba, width, height, content);
      yield { ...current, input: { ...current.input, rgba: enhanced } };
    }
  } finally {
    if (cur) disposeImage(cur.image);
  }
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm vitest run src/capDetect/detectLoop.test.ts`
Expected: PASS

- 「中止したら…」で 11 が閉じられていない場合は、受け取った直後の中止の確認で `f.image` を閉じているかを確かめる（`held` にも `images` にも入る前なので、catch では閉じられない）

- [ ] **Step 5: FramePreprocessor に toRgba を足す**

`src/inference/frameCanvas.ts` の `FramePreprocessor` の `toTensor` を次の2つに置き換える:

```ts
  /** レターボックス済みの RGBA（getImageData の新しい配列。呼ぶたびに別の配列になる） */
  toRgba(frame: VideoFrame): { rgba: Uint8ClampedArray; letterbox: Letterbox } {
    const { width, height } = displaySize(frame, this.rotation);
    if (!this.letterbox || !this.canvas) {
      this.letterbox = computeLetterbox(width, height, this.imgsz);
      this.canvas = new OffscreenCanvas(this.letterbox.inputWidth, this.letterbox.inputHeight);
    }
    const lb = this.letterbox;
    const ctx = context2d(this.canvas, true);
    ctx.fillStyle = `rgb(${PAD_VALUE},${PAD_VALUE},${PAD_VALUE})`;
    ctx.fillRect(0, 0, lb.inputWidth, lb.inputHeight);
    drawRotated(ctx, frame, this.rotation, lb.padLeft, lb.padTop, lb.newWidth, lb.newHeight);
    return { rgba: ctx.getImageData(0, 0, lb.inputWidth, lb.inputHeight).data, letterbox: lb };
  }

  toTensor(frame: VideoFrame): { tensor: Float32Array; letterbox: Letterbox } {
    const { rgba, letterbox } = this.toRgba(frame);
    return { tensor: rgbaToChw(rgba, letterbox.inputWidth, letterbox.inputHeight), letterbox };
  }
```

- [ ] **Step 6: runDetect.ts を書く**

`src/inference/runDetect.ts`:

```ts
/**
 * 1本の動画でキャップを検出する（ブラウザ依存の薄い層。段取りは capDetect/detectLoop.ts）。
 * フレームは1枚ずつ RGBA（レターボックス済み）と縮小画像にして、その場で閉じる。VideoFrame は持たない
 * （decodeFrames はデコーダへの投入を絞っているので、閉じずに持つとデコードが止まる）。
 */

import type { InferenceSession } from 'onnxruntime-web';

import { decodeDetections } from '../capDetect/decodeDetect';
import { type FrameImage, type LoopFrame, type RgbaInput, runDetectLoop, withEnhancement } from '../capDetect/detectLoop';
import { classIds, type FrameRecord, toFrameRecord } from '../capDetect/records';
import { estimateRemainingMs } from './eta';
import { displaySize, FramePreprocessor, makeThumbnail } from './frameCanvas';
import { type Letterbox, rgbaToChw } from './letterbox';
import type { CapDetector } from './manifest';
import { runPose as runModel } from './ortSession';
import { decodeFrames, type DemuxedVideo, type VideoInfo } from './videoSource';

export interface DetectRun {
  readonly fileName: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly records: readonly FrameRecord[];
  /** 推論したコマの縮小画像（frame 順） */
  readonly images: readonly FrameImage<ImageBitmap>[];
  readonly msPerInference: number;
}

interface DetectInput extends RgbaInput {
  readonly letterbox: Letterbox;
}

type Size = { width: number; height: number };

function prepareOne(frame: VideoFrame, index: number, pre: FramePreprocessor, rotation: VideoInfo['rotation']): LoopFrame<DetectInput, ImageBitmap> {
  try {
    const { rgba, letterbox: lb } = pre.toRgba(frame);
    const content = { x: lb.padLeft, y: lb.padTop, width: lb.newWidth, height: lb.newHeight };
    return { index, input: { rgba, width: lb.inputWidth, height: lb.inputHeight, content, letterbox: lb }, image: makeThumbnail(frame, rotation) };
  } finally {
    frame.close();
  }
}

async function* prepareFrames(
  video: DemuxedVideo,
  pre: FramePreprocessor,
  onDecoded: (done: number, size: Size) => void,
): AsyncGenerator<LoopFrame<DetectInput, ImageBitmap>> {
  const { rotation } = video.info;
  let index = 0;
  for await (const frame of decodeFrames(video)) {
    const size = displaySize(frame, rotation);
    const prepared = prepareOne(frame, index, pre, rotation);
    index += 1;
    onDecoded(index, size);
    yield prepared;
  }
}

export async function analyzeDetectVideo(
  video: DemuxedVideo,
  fileName: string,
  session: InferenceSession,
  detector: CapDetector,
  opts: { onProgress: (done: number, total: number, etaMs: number | null) => void; signal: AbortSignal },
): Promise<DetectRun> {
  const { frameCount, fps, rotation } = video.info;
  const ids = classIds(detector.classes);
  const started = performance.now();
  let size: Size = { width: 0, height: 0 };
  let inferMs = 0;
  let inferCount = 0;
  const source = prepareFrames(video, new FramePreprocessor(detector.imgsz, rotation), (done, shown) => {
    size = shown;
    opts.onProgress(done, frameCount, estimateRemainingMs(performance.now() - started, done, frameCount));
  });
  const close = (b: ImageBitmap) => b.close();
  const frames = detector.preprocess === 'enhanced' ? withEnhancement(source, close) : source;
  const detect = async (frame: number, input: DetectInput) => {
    const t0 = performance.now();
    const output = await runModel(session, rgbaToChw(input.rgba, input.width, input.height), input.width, input.height);
    inferMs += performance.now() - t0;
    inferCount += 1;
    return toFrameRecord(frame, decodeDetections(output, detector.classes.length, input.letterbox), ids);
  };
  const { records, images } = await runDetectLoop(frames, { detect, disposeImage: close, signal: opts.signal });
  return { fileName, fps, ...size, frameCount, records, images, msPerInference: inferCount > 0 ? inferMs / inferCount : 0 };
}
```

- [ ] **Step 7: 型チェックと全テストを通す**

Run: `pnpm tsc -b && pnpm test`
Expected: PASS（`runPose.ts` の `toTensor` の呼び出しは変わらず動く）

- [ ] **Step 8: コミットする**

```bash
git add src/capDetect/detectLoop.ts src/capDetect/detectLoop.test.ts src/inference/runDetect.ts src/inference/frameCanvas.ts
git commit -m "feat: キャップ検出の推論ループ（間引き・遡り・強調の窓・画像の保持）と1本分の検出を追加

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: 結果画面（軌跡の重ね描き・コマ送り・リリースの指定・球速・書き出し）

**Files:**
- Create: `src/trajectory/messages.ts`, `src/trajectory/messages.test.ts`
- Create: `src/trajectory/drawTrajectory.ts`
- Create: `src/trajectory/TrajectoryResult.tsx`, `src/trajectory/TrajectoryResult.test.tsx`

**Interfaces:**
- Consumes: `analyzeThrow`, `ThrowAnalysis`, `ThrowProblem`（Task 7）、`findReleaseCandidate`（Task 6）、`toTrajectoryJson`, `trajectoryJsonFileName`, `ReleaseSource`（Task 7）、`DetectRun`（Task 8）、`PITCH_DISTANCE_M`（Task 3）、`downloadJson`（`src/ui/download.ts`）、`Recommendation`（`src/inference/recommend.ts`）、`syntheticThrow` ほか（Task 7、テストのみ）
- Produces:
  - `describeProblem(problem: ThrowProblem): { title: string; actions: readonly string[] }`
  - `trajectoryEnvMessages(rec: Recommendation): readonly string[]`
  - `formatSpeed(kmh: number): string`
  - `SPEED_NOTE`, `SUSPICIOUS_NOTE`, `NO_RELEASE_NOTE`（文言）
  - `drawTrajectoryFrame(canvas: HTMLCanvasElement, image: ImageBitmap, overlay: { scale: number; analysis: ThrowAnalysis; currentFrame: number }): void`
  - `interface ResultModel { weights: string; imgsz: number; preprocess: 'raw' | 'enhanced' }`
  - `TrajectoryResult({ run, model, onExit }: { run: DetectRun; model: ResultModel; onExit: () => void })`

- [ ] **Step 1: 文言のテストを先に書く**

`src/trajectory/messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Recommendation } from '../inference/recommend';
import { describeProblem, formatSpeed, trajectoryEnvMessages } from './messages';

const rec = (verdict: Recommendation['verdict'], messages: string[] = ['元の文言']): Recommendation => ({
  verdict,
  executionProvider: verdict === 'unsupported' ? null : verdict === 'ok' ? 'webgpu' : 'wasm',
  allowedModes: [],
  recommendedMode: null,
  messages,
});

describe('describeProblem', () => {
  it('見つけられないときは撮り方の見直しをすすめる', () => {
    const text = describeProblem('too_few');
    expect(text.title).toBe('キャップの軌跡を見つけられませんでした');
    expect(text.actions.some((a) => a.includes('投手の後ろから'))).toBe(true);
  });

  it('リリースより後が足りないときは、まずリリースのコマを確かめるよう伝える', () => {
    expect(describeProblem('too_few_after_release').actions[0]).toContain('リリースより後');
  });
});

describe('trajectoryEnvMessages', () => {
  it('フォーム解析の「はやい」の話をせず、軌跡の解析向けの文言にする', () => {
    expect(trajectoryEnvMessages(rec('ok'))).toEqual(['この端末は高速モードで解析できます']);
    expect(trajectoryEnvMessages(rec('limited'))[0]).toContain('時間がかかります');
    expect(trajectoryEnvMessages(rec('unsupported', ['https で開いてください']))).toEqual(['https で開いてください']);
  });
});

describe('formatSpeed', () => {
  it('整数に丸めて「約」を付ける', () => {
    expect(formatSpeed(86.6)).toBe('約 87 km/h');
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm vitest run src/trajectory/messages.test.ts`
Expected: FAIL（`./messages` が無い）

- [ ] **Step 3: 文言を実装する**

`src/trajectory/messages.ts`:

```ts
/**
 * 投球の軌跡の画面に出す文言。「何が起きたか」と「次に何をすればよいか」をセットにする。専門用語は使わない。
 */

import type { ThrowProblem } from '../capDetect/analyzeThrow';
import { PITCH_DISTANCE_M } from '../capDetect/trajectory';
import type { Recommendation } from '../inference/recommend';

const SHOOTING_TIPS = [
  '投手の後ろから、キャップが飛ぶ範囲まで画面に入れて撮ってください',
  '明るい場所で撮ると見つけやすくなります',
  '1080p・60fps 以上で撮ってください',
] as const;

export function describeProblem(problem: ThrowProblem): { readonly title: string; readonly actions: readonly string[] } {
  const title = 'キャップの軌跡を見つけられませんでした';
  return problem === 'too_few_after_release'
    ? { title, actions: ['リリースより後にキャップが見えているコマが足りません。リリースのコマを確かめてください', ...SHOOTING_TIPS] }
    : { title, actions: SHOOTING_TIPS };
}

export const SPEED_NOTE = `リリースから最後にキャップが見えたコマまでの時間で、投本間 ${PITCH_DISTANCE_M}m を割った平均です`;
export const SUSPICIOUS_NOTE = '値がふつうの範囲から外れています。途中で見失った可能性があります';
export const NO_RELEASE_NOTE = 'リリースのコマが見つかりませんでした。コマ送りで指定できます';

export function trajectoryEnvMessages(rec: Recommendation): readonly string[] {
  if (rec.verdict === 'ok') return ['この端末は高速モードで解析できます'];
  if (rec.verdict === 'limited') {
    return ['この端末は高速モードに対応していないため、解析に時間がかかります。下の目安を見てから進めてください'];
  }
  return rec.messages;
}

export function formatSpeed(kmh: number): string {
  return `約 ${Math.round(kmh)} km/h`;
}
```

- [ ] **Step 4: 文言のテストが通ることを確かめる**

Run: `pnpm vitest run src/trajectory/messages.test.ts`
Expected: PASS

- [ ] **Step 5: 描画を書く**

`src/trajectory/drawTrajectory.ts`（canvas に描くだけ。テストでは jsdom の空の 2D コンテキストで呼ばれる）:

```ts
/**
 * 縮小画像に、フィットした軌跡の線・採用した点（塗り）・誤検出として除いた点（×）・
 * フィットに使わなかった検出（白抜き。リリースより前など）・今のコマの検出（黄色の輪）を重ねる。
 */

import type { ThrowAnalysis } from '../capDetect/analyzeThrow';

export interface TrajectoryOverlay {
  /** 表示座標 → 縮小画像の画素 */
  readonly scale: number;
  readonly analysis: ThrowAnalysis;
  readonly currentFrame: number;
}

const COLOR = { line: '#22d3ee', inlier: '#22d3ee', outlier: '#f87171', unused: '#ffffff', current: '#facc15' } as const;
const R = 3;

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, filled: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

function cross(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = COLOR.outlier;
  ctx.beginPath();
  ctx.moveTo(x - R, y - R);
  ctx.lineTo(x + R, y + R);
  ctx.moveTo(x + R, y - R);
  ctx.lineTo(x - R, y + R);
  ctx.stroke();
}

function polyline(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[]): void {
  if (points.length < 2) return;
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.lineWidth = 1;
}

export function drawTrajectoryFrame(canvas: HTMLCanvasElement, image: ImageBitmap, overlay: TrajectoryOverlay): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);
  const { scale: s, analysis: a } = overlay;
  polyline(ctx, a.trajectory.map((p) => [p.x * s, p.y * s] as const));
  const inliers = new Set(a.fit?.inliers.map((p) => p.frame));
  const outliers = new Set(a.fit?.outliers.map((p) => p.frame));
  a.detections.forEach((d) => {
    const [x, y] = [d.x * s, d.y * s];
    if (outliers.has(d.frame)) cross(ctx, x, y);
    else dot(ctx, x, y, inliers.has(d.frame) ? COLOR.inlier : COLOR.unused, inliers.has(d.frame));
    if (d.frame === overlay.currentFrame) {
      ctx.beginPath();
      ctx.arc(x, y, R * 3, 0, Math.PI * 2);
      ctx.strokeStyle = COLOR.current;
      ctx.stroke();
    }
  });
}
```

- [ ] **Step 6: 結果画面のテストを先に書く**

`src/trajectory/TrajectoryResult.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../ui/download', () => ({ downloadJson: vi.fn() }));

import type { FrameRecord } from '../capDetect/records';
import { SYNTH_FPS, SYNTH_HEIGHT, SYNTH_WIDTH, syntheticThrow } from '../capDetect/syntheticThrow';
import type { DetectRun } from '../inference/runDetect';
import { downloadJson } from '../ui/download';
import { TrajectoryResult } from './TrajectoryResult';

const fakeImage = () => ({ width: 320, height: 180, close: vi.fn() }) as unknown as ImageBitmap;

/** 全コマ推論した合成投球（画像の位置 = コマ番号） */
function makeRun(records: FrameRecord[] = syntheticThrow()): DetectRun {
  return {
    fileName: 'clip.mov',
    fps: SYNTH_FPS,
    width: SYNTH_WIDTH,
    height: SYNTH_HEIGHT,
    frameCount: 200,
    records,
    images: records.map((r) => ({ frame: r.frame, image: fakeImage() })),
    msPerInference: 40,
  };
}

const model = { weights: 'yolo8m_20250510.pt', imgsz: 640, preprocess: 'raw' as const };

describe('TrajectoryResult', () => {
  it('平均球速を推定値として出し、自動のリリースと、最後にキャップが写ったコマを示す', () => {
    render(<TrajectoryResult run={makeRun()} model={model} onExit={() => undefined} />);
    expect(screen.getByText(/平均球速 約 87 km\/h（推定値・試験的）/)).toBeInTheDocument();
    expect(screen.getByText('リリース: コマ 100（自動）')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'コマ' })).toHaveValue('124');
  });

  it('リリースを最後の検出より後にすると案内を出し、自動の候補に戻せる', async () => {
    render(<TrajectoryResult run={makeRun()} model={model} onExit={() => undefined} />);
    fireEvent.change(screen.getByRole('slider', { name: 'コマ' }), { target: { value: '150' } });
    await userEvent.click(screen.getByRole('button', { name: 'このコマをリリースにする' }));
    expect(screen.getByText('リリース: コマ 150（指定）')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('キャップの軌跡を見つけられませんでした');
    expect(screen.getByRole('alert')).toHaveTextContent('リリースより後');
    await userEvent.click(screen.getByRole('button', { name: '自動の候補に戻す' }));
    expect(screen.getByText(/約 87 km\/h/)).toBeInTheDocument();
  });

  it('キャップもリリースも見つからなければ、撮り方とコマ送りでの指定を案内する', () => {
    const records = syntheticThrow({ flightFrames: 0 }).map((r) => ({ ...r, pitcher: null }));
    render(<TrajectoryResult run={makeRun(records)} model={model} onExit={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('投手の後ろから');
    expect(screen.getByText('リリースのコマが見つかりませんでした。コマ送りで指定できます')).toBeInTheDocument();
  });

  it('結果を保存すると trajectory.json を書き出す', async () => {
    render(<TrajectoryResult run={makeRun()} model={model} onExit={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: '結果を保存' }));
    expect(downloadJson).toHaveBeenCalledWith(
      'clip_trajectory.json',
      expect.objectContaining({ schema: 'cap-pose-lab/trajectory', speedKmh: 86.6, release: { frame: 100, source: 'auto' } }),
    );
  });

  it('「最初に戻る」で抜けられる', async () => {
    const onExit = vi.fn();
    render(<TrajectoryResult run={makeRun()} model={model} onExit={onExit} />);
    await userEvent.click(screen.getByRole('button', { name: '最初に戻る' }));
    expect(onExit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: テストが落ちることを確かめる**

Run: `pnpm vitest run src/trajectory/TrajectoryResult.test.tsx`
Expected: FAIL（`./TrajectoryResult` が無い）

- [ ] **Step 8: 結果画面を実装する**

`src/trajectory/TrajectoryResult.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';

import { analyzeThrow, type ThrowAnalysis } from '../capDetect/analyzeThrow';
import { findReleaseCandidate } from '../capDetect/release';
import { type ReleaseSource, toTrajectoryJson, trajectoryJsonFileName } from '../capDetect/trajectoryJson';
import type { DetectRun } from '../inference/runDetect';
import { downloadJson } from '../ui/download';
import { drawTrajectoryFrame } from './drawTrajectory';
import { describeProblem, formatSpeed, NO_RELEASE_NOTE, SPEED_NOTE, SUSPICIOUS_NOTE } from './messages';

export interface ResultModel {
  readonly weights: string;
  readonly imgsz: number;
  readonly preprocess: 'raw' | 'enhanced';
}

interface Release {
  readonly frame: number | null;
  readonly source: ReleaseSource;
}

const button = 'min-h-11 rounded-xl border border-current/40 px-3';

/** 最初に見せるコマ: 最後にキャップが写っていたコマ（無ければ最後のコマ） */
function initialPosition(run: DetectRun): number {
  const lastCap = [...run.records].sort((a, b) => b.frame - a.frame).find((r) => r.cap !== null)?.frame;
  const i = run.images.findIndex((im) => im.frame === lastCap);
  return i >= 0 ? i : Math.max(0, run.images.length - 1);
}

function ReleaseControls({ auto, release, currentFrame, onChange }: {
  readonly auto: number | null;
  readonly release: Release;
  readonly currentFrame: number | null;
  readonly onChange: (r: Release) => void;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p>{release.frame === null ? NO_RELEASE_NOTE : `リリース: コマ ${release.frame}（${release.source === 'auto' ? '自動' : '指定'}）`}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={button} disabled={currentFrame === null}
          onClick={() => currentFrame !== null && onChange({ frame: currentFrame, source: 'manual' })}>
          このコマをリリースにする
        </button>
        {auto !== null && release.source === 'manual' && (
          <button type="button" className={button} onClick={() => onChange({ frame: auto, source: 'auto' })}>
            自動の候補に戻す
          </button>
        )}
      </div>
    </div>
  );
}

function ResultCard({ analysis: a }: { readonly analysis: ThrowAnalysis }) {
  if (a.problem) {
    const text = describeProblem(a.problem);
    return (
      <section role="alert" className="space-y-1 rounded-xl border-2 border-amber-500 p-3 text-sm">
        <p className="font-bold">{text.title}</p>
        <ul className="list-disc pl-5">
          {text.actions.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </section>
    );
  }
  return (
    <section className="space-y-1 rounded-xl border border-current/20 p-3">
      <p className="text-lg font-bold">平均球速 {a.speedKmh === null ? '—' : formatSpeed(a.speedKmh)}（推定値・試験的）</p>
      <p className="text-sm">{SPEED_NOTE}</p>
      {a.speedSuspicious && <p className="text-sm text-amber-600">{SUSPICIOUS_NOTE}</p>}
    </section>
  );
}

function Details({ run, analysis: a }: { readonly run: DetectRun; readonly analysis: ThrowAnalysis }) {
  const rows: [string, string][] = [
    ['キャップを検出したコマ', String(a.detections.length)],
    ['軌跡に採用した点', String(a.fit?.inliers.length ?? 0)],
    ['誤検出として除いた点', String(a.fit?.outliers.length ?? 0)],
    ['フィットの残差', a.fit ? `${a.fit.rmse.toFixed(1)} px` : '—'],
    ['推論したコマ', `${run.records.length} / ${run.frameCount}`],
    ['1コマの推論時間', `${Math.round(run.msPerInference)} ms`],
  ];
  return (
    <details className="text-sm">
      <summary className="min-h-11 cursor-pointer py-2">詳しい情報</summary>
      <dl className="grid grid-cols-2 gap-1">
        {rows.map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
      </dl>
    </details>
  );
}

export function TrajectoryResult({ run, model, onExit }: { readonly run: DetectRun; readonly model: ResultModel; readonly onExit: () => void }) {
  const auto = useMemo(() => findReleaseCandidate(run.records), [run]);
  const [release, setRelease] = useState<Release>({ frame: auto, source: auto === null ? 'none' : 'auto' });
  const [position, setPosition] = useState(() => initialPosition(run));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysis = useMemo(
    () => analyzeThrow({ records: run.records, fps: run.fps, frameHeight: run.height, releaseFrame: release.frame }),
    [run, release.frame],
  );
  const current = run.images[position] ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !current) return;
    drawTrajectoryFrame(canvas, current.image, { scale: current.image.width / run.width, analysis, currentFrame: current.frame });
  }, [analysis, current, run.width]);

  const move = (delta: number) => setPosition((p) => Math.min(run.images.length - 1, Math.max(0, p + delta)));
  const save = () =>
    downloadJson(
      trajectoryJsonFileName(run.fileName),
      toTrajectoryJson({
        fileName: run.fileName, fps: run.fps, width: run.width, height: run.height, frameCount: run.frameCount,
        model, releaseFrame: release.frame, releaseSource: release.source, records: run.records, analysis,
      }),
    );

  return (
    <section className="space-y-4">
      <canvas ref={canvasRef} className="w-full rounded-lg bg-black" />
      <input type="range" aria-label="コマ" min={0} max={Math.max(0, run.images.length - 1)} step={1} value={position}
        onChange={(e) => setPosition(Number(e.target.value))} className="h-11 w-full" />
      <div className="flex gap-2">
        <button type="button" aria-label="前のコマ" className={`${button} flex-1`} onClick={() => move(-1)}>◀ 前</button>
        <span className="flex min-h-11 flex-1 items-center justify-center text-sm tabular-nums">コマ {current?.frame ?? '—'}</span>
        <button type="button" aria-label="次のコマ" className={`${button} flex-1`} onClick={() => move(1)}>次 ▶</button>
      </div>
      <ReleaseControls auto={auto} release={release} currentFrame={current?.frame ?? null} onChange={setRelease} />
      <ResultCard analysis={analysis} />
      <Details run={run} analysis={analysis} />
      <button type="button" onClick={save} className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white">結果を保存</button>
      <button type="button" onClick={onExit} className="w-full min-h-11 rounded-xl border border-current/40">最初に戻る</button>
    </section>
  );
}
```

（スライダーの位置は「推論したコマの画像」の並びの番号。推論していないコマには画像も検出も無いので、コマ送りで飛ばしてよい。）

- [ ] **Step 9: テストが通ることを確かめる**

Run: `pnpm vitest run src/trajectory/ && pnpm lint`
Expected: PASS。lint エラーなし

- [ ] **Step 10: コミットする**

```bash
git add src/trajectory/messages.ts src/trajectory/messages.test.ts src/trajectory/drawTrajectory.ts src/trajectory/TrajectoryResult.tsx src/trajectory/TrajectoryResult.test.tsx
git commit -m "feat: 投球の軌跡の結果画面（重ね描き・コマ送り・リリースの指定・球速・書き出し）を追加

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: スタート画面からの分岐と、解析の流れ

**Files:**
- Create: `src/ui/ErrorPanel.tsx`, `src/ui/ErrorPanel.test.tsx`
- Create: `src/trajectory/runTrajectory.ts`
- Create: `src/trajectory/TrajectoryFlow.tsx`, `src/trajectory/TrajectoryFlow.test.tsx`
- Modify: `src/ui/VideoPicker.tsx`（`max` を足す）
- Modify: `src/ui/EnvStatus.tsx`（`messages` を足す）
- Modify: `src/ui/StartScreen.tsx`（`onTrajectory` を足す）
- Modify: `src/inference/estimate.ts`, `src/inference/estimate.test.ts`（`estimateDetectSeconds`）
- Modify: `src/inference/speedStore.ts`, `src/inference/speedStore.test.ts`（キーに `'capDetect'`）
- Modify: `src/App.tsx`, `src/App.test.tsx`

スタート画面の既存の「はじめる」（フォーム解析）はそのまま残し、下に「投球の軌跡を見る（試験的）」を足す（設計書 §6 画面0 の分岐）。

**Interfaces:**
- Consumes: `analyzeDetectVideo`, `DetectRun`（Task 8）、`TrajectoryResult`（Task 9）、`trajectoryEnvMessages`（Task 9）、`expectedInferences`（Task 6）、`CapDetector`, `modelUrl`（Task 1）、`fetchModel`, `openModelCache`, `isModelCached`, `ORT_RUNTIME_MB`（`modelStore.ts`）、`createSession`, `isOrtRuntimeLoaded`（`ortSession.ts`）、`createSessionWithFallback`（`flow/runAnalysis.ts`）、`loadPickedVideos`, `isDecoderSupported`, `PickedVideo`（`flow/pickVideos.ts`）、`friendlyError`（`content/errors.ts`）
- Produces:
  - `ErrorPanel({ error, onRetry }: { error: FriendlyError; onRetry?: () => void })`
  - `VideoPicker` の `max?: 1 | 2`（既定 2）
  - `EnvStatus` の `messages?: readonly string[]`
  - `StartScreen` の `onTrajectory: () => void`
  - `estimateDetectSeconds(frames: number, ep: ExecutionProvider, opts: { isMobile: boolean; measuredMsPerInference?: number }): number`
  - `type SpeedKey = ModeId | 'capDetect'`（`loadMeasuredSpeed` / `saveMeasuredSpeed` の第1引数）
  - `runTrajectory(input: { video: DemuxedVideo; fileName: string; detector: CapDetector; ep: ExecutionProvider; signal: AbortSignal; onProgress: (p: ProgressState) => void }): Promise<DetectRun>`
  - `TrajectoryFlow({ report, rec, manifest, onExit })`

- [ ] **Step 1: 見積もりと速度の保存のテストを先に書く**

`src/inference/estimate.test.ts` に追加する:

```ts
import { estimateDetectSeconds } from './estimate';

describe('estimateDetectSeconds', () => {
  it('推論する見込みのコマ数（間引き + 連続 + 遡り）で見積もる', () => {
    const desktop = estimateDetectSeconds(600, 'webgpu', { isMobile: false });
    const mobile = estimateDetectSeconds(600, 'webgpu', { isMobile: true });
    expect(mobile).toBeCloseTo(desktop * 3, 6);
    expect(estimateDetectSeconds(600, 'webgpu', { isMobile: false, measuredMsPerInference: 100 })).toBeCloseTo((154 * 100) / 1000, 6);
  });

  it('実測値が使えない値なら基準値に戻る', () => {
    const base = estimateDetectSeconds(100, 'wasm', { isMobile: false });
    expect(estimateDetectSeconds(100, 'wasm', { isMobile: false, measuredMsPerInference: Number.NaN })).toBe(base);
  });
});
```

（`import` は既存の import 群にまとめる。`describe` / `expect` / `it` は既存の import を使う。）

`src/inference/speedStore.test.ts` に追加する:

```ts
  it('キャップ検出の速度も別のキーで残せる', () => {
    const storage = new Map<string, string>();
    const fake = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) } as unknown as Storage;
    saveMeasuredSpeed('capDetect', 'webgpu', 42, fake);
    expect(loadMeasuredSpeed('capDetect', 'webgpu', fake)).toBe(42);
    expect(loadMeasuredSpeed('fast', 'webgpu', fake)).toBeUndefined();
  });
```

（既存の `describe` の中に置く。既存のテストに同じような fake があればそれを使う。）

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `pnpm vitest run src/inference/estimate.test.ts src/inference/speedStore.test.ts`
Expected: FAIL（`estimateDetectSeconds` が無い／`'capDetect'` が型エラー）

- [ ] **Step 3: 見積もりと速度の保存を実装する**

`src/inference/estimate.ts` に追加する。基準値は **Task 1 Step 10 で控えた数字**（fp16・高速処理の ms と、CPU 処理の ms）を入れる。控えが無い場合だけ下の値を使う:

```ts
import { expectedInferences } from '../capDetect/gate';

/** キャップ検出1回の基準（Mac Chrome の実測。計画5 Task 1 で測った値）。スマホは MOBILE_FACTOR 倍で仮置き */
const CAP_DETECT_MS: Record<ExecutionProvider, number> = { webgpu: 60, wasm: 2000 };

export function estimateDetectSeconds(
  frames: number,
  ep: ExecutionProvider,
  opts: { isMobile: boolean; measuredMsPerInference?: number },
): number {
  const measured = opts.measuredMsPerInference;
  const ms =
    measured !== undefined && Number.isFinite(measured) && measured > 0
      ? measured
      : CAP_DETECT_MS[ep] * (opts.isMobile ? MOBILE_FACTOR : 1);
  return (expectedInferences(frames) * ms) / 1000;
}
```

`src/inference/speedStore.ts` の `ModeId` を使っている3か所を `SpeedKey` にする:

```ts
/** 姿勢推定のモードごと、またはキャップ検出（1回の推論あたり） */
export type SpeedKey = ModeId | 'capDetect';

const key = (mode: SpeedKey, ep: ExecutionProvider) => `capPoseLab.speed.${mode}.${ep}`;
```

`loadMeasuredSpeed(mode: SpeedKey, ...)` と `saveMeasuredSpeed(mode: SpeedKey, ...)` の引数の型も `SpeedKey` にする。

- [ ] **Step 4: テストが通ることを確かめる**

Run: `pnpm vitest run src/inference/estimate.test.ts src/inference/speedStore.test.ts`
Expected: PASS

- [ ] **Step 5: ErrorPanel を切り出す（テスト → 実装）**

`src/ui/ErrorPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorPanel } from './ErrorPanel';

const error = { title: 'ダウンロードに失敗しました', action: 'もう一度試してください', detail: 'DownloadError: x', retryable: true };

describe('ErrorPanel', () => {
  it('何が起きたかと次にすることを出し、再試行を渡されたときだけボタンを出す', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorPanel error={error} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ダウンロードに失敗しました');
    await userEvent.click(screen.getByRole('button', { name: 'もう一度試す' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<ErrorPanel error={error} />);
    expect(screen.queryByRole('button', { name: 'もう一度試す' })).toBeNull();
  });
});
```

`src/ui/ErrorPanel.tsx`（`App.tsx` のエラー表示をそのまま移す）:

```tsx
import type { FriendlyError } from '../content/errors';

export function ErrorPanel({ error, onRetry }: { readonly error: FriendlyError; readonly onRetry?: () => void }) {
  return (
    <section role="alert" className="space-y-1 rounded-xl border-2 border-red-500 p-3 text-sm">
      <p className="font-bold">{error.title}</p>
      <p>{error.action}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white">
          もう一度試す
        </button>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer py-2">詳しい情報</summary>
        <pre className="whitespace-pre-wrap break-all text-xs">{error.detail}</pre>
      </details>
    </section>
  );
}
```

`src/App.tsx` の `{error && ( <section role="alert" ...> ... </section> )}` を次に置き換える:

```tsx
      {error && <ErrorPanel error={error} onRetry={error.retryable && model && ready.length > 0 ? run : undefined} />}
```

Run: `pnpm vitest run src/ui/ErrorPanel.test.tsx src/App.test.tsx`
Expected: PASS

- [ ] **Step 6: VideoPicker・EnvStatus・StartScreen に引数を足す**

`src/ui/VideoPicker.tsx`:

```tsx
interface Props {
  readonly picked: readonly PickedVideo[];
  readonly onPick: (files: File[]) => void;
  /** 選べる本数（既定 2） */
  readonly max?: 1 | 2;
}

export function VideoPicker({ picked, onPick, max = 2 }: Props) {
  return (
    <section className="space-y-3">
      <label className="block w-full min-h-11 cursor-pointer rounded-xl border-2 border-dashed border-current/40 p-4 text-center">
        {max === 1 ? '動画を選ぶ（1本）' : '動画を選ぶ（1本 または 比べたい2本）'}
        <input
          type="file"
          accept="video/*"
          multiple={max > 1}
          className="sr-only"
          onChange={(e) => onPick(Array.from(e.target.files ?? []).slice(0, max))}
        />
      </label>
      {/* picked の表示は既存のまま */}
```

`src/ui/EnvStatus.tsx`: 引数に `messages?: readonly string[]` を足し、表示に使う文言を `const lines = messages ?? rec.messages;` にして、`rec.messages[0]` / `rec.messages.slice(1)` を `lines[0]` / `lines.slice(1)` に置き換える。

`src/ui/StartScreen.tsx`: 引数に `onTrajectory: () => void` を足し、「保存した解析結果で比べる」ボタンの後ろに追加する:

```tsx
      <hr className="border-current/20" />
      <p className="text-sm">投手の後ろから撮った1球分の動画で、キャップの軌跡と平均球速を推定します（試験的）。</p>
      <button type="button" onClick={onTrajectory} className="w-full min-h-11 rounded-xl border border-current/40">
        投球の軌跡を見る（試験的）
      </button>
```

- [ ] **Step 7: 解析の段取り（runTrajectory）を書く**

`src/trajectory/runTrajectory.ts`（モデルの取得 → セッション → 検出 → 速度の保存。ブラウザ依存なのでテストは TrajectoryFlow と実機で見る）:

```ts
import { createSessionWithFallback } from '../flow/runAnalysis';
import { formatDuration } from '../inference/eta';
import { type CapDetector, modelUrl } from '../inference/manifest';
import { fetchModel, openModelCache } from '../inference/modelStore';
import { createSession } from '../inference/ortSession';
import type { ExecutionProvider } from '../inference/recommend';
import { analyzeDetectVideo, type DetectRun } from '../inference/runDetect';
import { saveMeasuredSpeed } from '../inference/speedStore';
import type { DemuxedVideo } from '../inference/videoSource';
import type { ProgressState } from '../ui/RunProgress';

export interface TrajectoryRunInput {
  readonly video: DemuxedVideo;
  readonly fileName: string;
  readonly detector: CapDetector;
  readonly ep: ExecutionProvider;
  readonly signal: AbortSignal;
  readonly onProgress: (p: ProgressState) => void;
}

export async function runTrajectory({ video, fileName, detector, ep, signal, onProgress }: TrajectoryRunInput): Promise<DetectRun> {
  const bytes = await fetchModel(
    modelUrl(detector),
    await openModelCache(),
    // 圧縮配信では全体の大きさが分からないので、manifest のサイズを目安にする
    (got, total) => onProgress({ label: 'モデルをダウンロード中', done: got, total: total || detector.sizeMB * 1024 * 1024, eta: '' }),
    fetch,
    signal,
  );
  onProgress({ label: '解析の準備中', done: 0, total: 1, eta: '' });
  const prepared = await createSessionWithFallback(bytes, ep, createSession);
  const note = prepared.fellBack ? '（高速モードが使えなかったため、時間がかかります）' : '';
  try {
    const run = await analyzeDetectVideo(video, fileName, prepared.loaded.session, detector, {
      signal,
      onProgress: (d, t, eta) => onProgress({ label: `キャップを探しています${note}`, done: d, total: t, eta: formatDuration(eta) }),
    });
    saveMeasuredSpeed('capDetect', prepared.ep, run.msPerInference);
    return run;
  } finally {
    await prepared.loaded.session.release();
  }
}
```

- [ ] **Step 8: TrajectoryFlow のテストを先に書く**

`src/trajectory/TrajectoryFlow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../flow/pickVideos', async (orig) => ({
  ...(await orig<typeof import('../flow/pickVideos')>()),
  loadPickedVideos: vi.fn(async (files: File[]) =>
    files.map((file) => ({ file, video: { info: { frameCount: 600, durationSec: 10, fps: 60 } }, problem: null })),
  ),
}));
vi.mock('../inference/modelStore', async (orig) => ({
  ...(await orig<typeof import('../inference/modelStore')>()),
  openModelCache: async () => null,
  isModelCached: async () => false,
}));

import manifestJson from '../../public/models/manifest.json';
import type { CapabilityReport } from '../inference/capabilities';
import { parseManifest } from '../inference/manifest';
import type { Recommendation } from '../inference/recommend';
import { TrajectoryFlow } from './TrajectoryFlow';

const manifest = parseManifest(manifestJson);
const report = { isMobile: false } as unknown as CapabilityReport;
const limited: Recommendation = {
  verdict: 'limited',
  executionProvider: 'wasm',
  allowedModes: ['fast'],
  recommendedMode: 'fast',
  messages: ['この端末は高速モードに対応していないため、「はやい」だけを選べます。'],
};

describe('TrajectoryFlow', () => {
  it('軌跡の解析向けの環境の文言を出し、動画を1本選ぶまで進めない', () => {
    render(<TrajectoryFlow report={report} rec={limited} manifest={manifest} onExit={() => undefined} />);
    expect(screen.getByText(/解析に時間がかかります/)).toBeInTheDocument();
    expect(screen.queryByText(/「はやい」だけ/)).toBeNull();
    expect(screen.getByText('動画を選ぶ（1本）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('動画を選ぶと目安の時間が出て、ダウンロードの確認に進める', async () => {
    render(<TrajectoryFlow report={report} rec={limited} manifest={manifest} onExit={() => undefined} />);
    await userEvent.upload(screen.getByLabelText('動画を選ぶ（1本）'), new File(['x'], 'clip.mp4', { type: 'video/mp4' }));
    expect(await screen.findByText(/解析の目安: 約/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(await screen.findByText(/キャップ検出モデル（約 \d+ MB）/)).toBeInTheDocument();
  });

  it('「最初に戻る」で抜けられる', async () => {
    const onExit = vi.fn();
    render(<TrajectoryFlow report={report} rec={limited} manifest={manifest} onExit={onExit} />);
    await userEvent.click(screen.getByRole('button', { name: '最初に戻る' }));
    expect(onExit).toHaveBeenCalled();
  });
});
```

`src/App.test.tsx` の `describe('App', ...)` に追加する:

```tsx
  it('はじめに画面から、投球の軌跡の解析に進める', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '投球の軌跡を見る（試験的）' }));
    expect(screen.getByRole('heading', { name: '投球の軌跡（試験的）' })).toBeInTheDocument();
  });
```

- [ ] **Step 9: テストが落ちることを確かめる**

Run: `pnpm vitest run src/trajectory/TrajectoryFlow.test.tsx src/App.test.tsx`
Expected: FAIL（`./TrajectoryFlow` が無い／ボタンが無い）

- [ ] **Step 10: TrajectoryFlow を実装し、App につなぐ**

`src/trajectory/TrajectoryFlow.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

import { friendlyError, type FriendlyError } from '../content/errors';
import { isDecoderSupported, loadPickedVideos, type PickedVideo } from '../flow/pickVideos';
import type { CapabilityReport } from '../inference/capabilities';
import { estimateDetectSeconds } from '../inference/estimate';
import { formatDuration } from '../inference/eta';
import { type Manifest, modelUrl } from '../inference/manifest';
import { isModelCached, openModelCache, ORT_RUNTIME_MB } from '../inference/modelStore';
import { isOrtRuntimeLoaded } from '../inference/ortSession';
import type { Recommendation } from '../inference/recommend';
import type { DetectRun } from '../inference/runDetect';
import { loadMeasuredSpeed } from '../inference/speedStore';
import { demuxVideo } from '../inference/videoSource';
import { DownloadConsent, type DownloadItem } from '../ui/DownloadConsent';
import { EnvStatus } from '../ui/EnvStatus';
import { ErrorPanel } from '../ui/ErrorPanel';
import { type ProgressState, RunProgress } from '../ui/RunProgress';
import { useWakeLock } from '../ui/useWakeLock';
import { VideoPicker } from '../ui/VideoPicker';
import { trajectoryEnvMessages } from './messages';
import { runTrajectory } from './runTrajectory';
import { TrajectoryResult } from './TrajectoryResult';

type Step = 'setup' | 'consent' | 'running' | 'result';

interface Props {
  readonly report: CapabilityReport | null;
  readonly rec: Recommendation | null;
  readonly manifest: Manifest | null;
  readonly onExit: () => void;
}

const primary = 'w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white disabled:opacity-40';
const secondary = 'w-full min-h-11 rounded-xl border border-current/40';

export function TrajectoryFlow({ report, rec, manifest, onExit }: Props) {
  const [step, setStep] = useState<Step>('setup');
  const [picked, setPicked] = useState<PickedVideo[]>([]);
  const [consentItems, setConsentItems] = useState<DownloadItem[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ label: '', done: 0, total: 0, eta: '' });
  const [run, setRun] = useState<DetectRun | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useWakeLock(step === 'running');
  // 結果を差し替えたとき・画面を離れるときに縮小画像を解放する
  useEffect(() => () => run?.images.forEach((i) => i.image.close()), [run]);

  const detector = manifest?.capDetector ?? null;
  const ep = rec?.executionProvider ?? null;
  const ready = picked.find((p) => p.video && !p.problem) ?? null;
  const frames = ready?.video?.info.frameCount ?? 0;
  const estimate =
    ready && ep
      ? formatDuration(estimateDetectSeconds(frames, ep, { isMobile: report?.isMobile ?? false, measuredMsPerInference: loadMeasuredSpeed('capDetect', ep) }) * 1000)
      : null;

  const onPick = useCallback(async (files: File[]) => {
    setError(null);
    setPicked([]); // 前の動画を先に手放してから読み込む
    setPicked(await loadPickedVideos(files.slice(0, 1), demuxVideo, isDecoderSupported));
  }, []);

  const prepare = useCallback(async () => {
    if (!detector) return;
    const cache = await openModelCache();
    setConsentItems([
      ...(isOrtRuntimeLoaded() ? [] : [{ label: '解析エンジン', sizeMB: ORT_RUNTIME_MB }]),
      ...((await isModelCached(modelUrl(detector), cache)) ? [] : [{ label: 'キャップ検出モデル', sizeMB: detector.sizeMB }]),
    ]);
    setStep('consent');
  }, [detector]);

  const start = useCallback(async () => {
    if (!detector || !ep || !ready?.video) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('running');
    setError(null);
    try {
      const result = await runTrajectory({ video: ready.video, fileName: ready.file.name, detector, ep, signal: controller.signal, onProgress: setProgress });
      setRun(result);
      setStep('result');
    } catch (e) {
      setError(friendlyError(e));
      setStep('setup');
    }
  }, [detector, ep, ready]);

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-bold">投球の軌跡（試験的）</h2>
      {error && <ErrorPanel error={error} onRetry={error.retryable && ready ? start : undefined} />}
      {step === 'setup' && (
        <>
          <EnvStatus report={report} rec={rec} messages={rec ? trajectoryEnvMessages(rec) : undefined} />
          <p className="text-sm">投手の後ろから撮った、1球分の動画（20秒以内）を選んでください。</p>
          <VideoPicker picked={picked} onPick={onPick} max={1} />
          {estimate && <p className="text-sm">解析の目安: {estimate}</p>}
          <button type="button" onClick={prepare} disabled={!detector || !ready || rec?.verdict === 'unsupported'} className={primary}>
            次へ
          </button>
          <button type="button" onClick={onExit} className={secondary}>
            最初に戻る
          </button>
        </>
      )}
      {step === 'consent' && <DownloadConsent items={consentItems} onAccept={start} onCancel={() => setStep('setup')} />}
      {step === 'running' && <RunProgress state={progress} onCancel={() => abortRef.current?.abort()} />}
      {step === 'result' && run && detector && (
        <TrajectoryResult
          run={run}
          model={{ weights: detector.weights, imgsz: detector.imgsz, preprocess: detector.preprocess }}
          onExit={onExit}
        />
      )}
    </section>
  );
}
```

`src/App.tsx`:
- `import { TrajectoryFlow } from './trajectory/TrajectoryFlow';` と `import { ErrorPanel } from './ui/ErrorPanel';` を足す（Step 5 で済んでいれば後者は不要）
- `type Step` に `'trajectory'` を足す
- `<StartScreen onStart={...} onLoadSaved={...} onTrajectory={() => setStep('trajectory')} />`
- `{step === 'compare' && ...}` の後ろに追加する:

```tsx
      {step === 'trajectory' && <TrajectoryFlow report={report} rec={rec} manifest={manifest} onExit={() => setStep('start')} />}
```

- [ ] **Step 11: テスト・型・lint・ビルドを通す**

Run: `pnpm test:coverage && pnpm lint && pnpm build`
Expected: PASS。カバレッジは lines / functions / branches / statements とも 80% 以上

- 80% を割ったら、足りないのが `src/capDetect/` か `src/trajectory/messages.ts` かを見て、そのファイルのテストを足す（設定の閾値は下げない）

- [ ] **Step 12: コミットする**

```bash
git add src/ui/ErrorPanel.tsx src/ui/ErrorPanel.test.tsx src/ui/VideoPicker.tsx src/ui/EnvStatus.tsx src/ui/StartScreen.tsx \
  src/inference/estimate.ts src/inference/estimate.test.ts src/inference/speedStore.ts src/inference/speedStore.test.ts \
  src/trajectory/runTrajectory.ts src/trajectory/TrajectoryFlow.tsx src/trajectory/TrajectoryFlow.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: スタート画面から投球の軌跡の解析（準備・ダウンロード確認・解析・結果）に進めるようにする

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: 実映像での確認（比較ツール・README・基準値の更新）

**Files:**
- Create: `tools/compare_trajectory.py`
- Modify: `README.md`
- Modify: `src/inference/estimate.ts`（実測で基準値が変わった場合だけ）

**Interfaces:**
- Consumes: 書き出した `{動画名}_trajectory.json`（Task 7 の形）、`public/models/manifest.json` の `capDetector`
- Produces: 手作業の確認手順と、その結果の数字（作業記録 `.superpowers/sdd/` に残す。git には入れない）

- [ ] **Step 1: 比較ツールを書く**

`tools/compare_trajectory.py`:

```python
"""手元の動画で、Python（ultralytics + SHARED の trajectory_fitter）とブラウザ版の結果を見比べる（手作業の確認用）。

    SHARED_ROOT=<ultralytics のフォーク>/shared <その venv の python> tools/compare_trajectory.py 動画.mp4 --browser 動画_trajectory.json

- 全コマを元のフレームのまま（raw）推論する。重み・入力サイズは manifest の capDetector、信頼度は 0.15
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


def detect_all(video: str, model: YOLO, imgsz: int) -> tuple[dict[int, tuple[float, float]], float, int]:
    cap_id = next(i for i, name in model.names.items() if name == "cap")
    capture = cv2.VideoCapture(video)
    fps = capture.get(cv2.CAP_PROP_FPS)
    found: dict[int, tuple[float, float]] = {}
    index, height = 0, 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        height = frame.shape[0]
        boxes = model(frame, imgsz=imgsz, conf=CONF, verbose=False)[0].boxes
        caps = [(float(b.conf[0]), b.xyxy[0].tolist()) for b in boxes if int(b.cls[0]) == cap_id]
        if caps:
            _, (x1, y1, x2, y2) = max(caps, key=lambda c: c[0])
            found[index] = ((x1 + x2) / 2, (y1 + y2) / 2)
        index += 1
    capture.release()
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
    found, fps, height = detect_all(args.video, model, detector["imgsz"])
    print(f"fps {fps:.2f} / 高さ {height}px / キャップを検出したコマ {len(found)}")
    browser = json.loads(Path(args.browser).read_text(encoding="utf-8")) if args.browser else None
    speed = python_speed(found, fps, height, browser["release"]["frame"] if browser else None)
    print(f"球速: Python {None if speed is None else round(speed, 1)} km/h" + (f" / ブラウザ {browser['speedKmh']} km/h" if browser else ""))
    if browser:
        compare(found, browser)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: README に使い方と確認手順を足す**

`README.md` の冒頭の箇条書きの「キャップ検出と投球軌跡（試験的）」を次に置き換える:

```markdown
- 投球の軌跡と平均球速（試験的）: 投手の後ろから撮った1球分の動画から、キャップの軌跡を映像に重ね、平均球速を推定する。フォーム比較とは撮る向きが違う別の機能
```

「実機での確認（iPhone / Android）」の後ろに追加する:

````markdown
## 投球の軌跡の確認（実際の映像で）

合成データのテストでは、実際の映像でキャップを拾えるかは分からないため、手元の動画で Python 版と見比べる。
動画と結果の JSON はリポジトリに入れない。

1. 投手の後ろから撮った試合映像を、1球分（20秒以内）に切り出す
2. `pnpm dev` で開き、「投球の軌跡を見る（試験的）」でその動画を解析する。軌跡の線がキャップの飛んだ跡に重なるか、リリースのコマが妥当かを目で確かめ、「結果を保存」で `_trajectory.json` を保存する
3. Python 版と比べる（`tools/weights/` の重みは `tools/export_models.py` が取得済み）

   ```bash
   SHARED_ROOT=<ultralytics のフォーク>/shared <その venv の python> tools/compare_trajectory.py 動画.mp4 --browser 動画_trajectory.json
   ```

4. 目安: 両方で検出したコマが、どちらかで検出したコマの 9 割以上／位置の差の平均が 3px 以内／球速の差が 5% 以内。
   外れる場合は、縮小のしかた（ブラウザと OpenCV の補間の違い）と、外れ値の閾値（画面の高さ × 0.015）を疑う

差分強調（`preprocess: "enhanced"`）のモデルに差し替えたときは、この確認をやり直す（いまのモデルは元のフレームで学習しているため、強調の経路は合成データでしか確かめていない）。
````

- [ ] **Step 3: 実際の映像で確認する（手作業・判断の分かれ目）**

ユーザーに、投手の後ろから撮った試合映像の切り出しを1本用意してもらい、README の手順 1〜3 を行う。

- 目安（手順 4）を満たす → 数字を作業記録に残して先へ進む
- 満たさない → **ここで止めて、compare_trajectory.py の出力と、画面の見た目（軌跡の線の重なり）をユーザーに報告する。** 閾値や前処理を黙って変えない（設計書 §9.7 の値を変えることになるため）

あわせて、結果画面の「詳しい情報」の「1コマの推論時間」を控える。Task 10 で入れた `CAP_DETECT_MS.webgpu` と 1.5 倍以上違えば、`src/inference/estimate.ts` の値を実測値に直す。

- [ ] **Step 4: 全体のテスト・lint・ビルドを通してコミットする**

Run: `pnpm test:coverage && pnpm lint && pnpm build`
Expected: PASS

```bash
git add tools/compare_trajectory.py README.md src/inference/estimate.ts
git commit -m "docs: 投球の軌跡を実際の映像で確かめる手順と比較ツールを追加

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

（`estimate.ts` を直していなければ `git add` から外す。）

- [ ] **Step 5: 公開後の確認をユーザーに伝える**

push は計画の範囲外（ユーザーの判断）。push して Pages に出たら、iPhone Safari で次を確かめてもらうよう伝える:
1. `diagnostics.html` の「キャップ検出で推論を試す」が成功するか（fp16 のセッションを高速処理で作れるか）と、推論1回の時間
2. 「投球の軌跡を見る（試験的）」で1本解析でき、「詳しい情報」の推論時間と、残り時間の目安が大きく外れていないか
