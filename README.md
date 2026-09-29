# cap-pose-lab

キャップ野球の投球動画を、ブラウザの中だけで解析するツール（開発中）。
動画はサーバに送信されない。推論は WebGPU（使えない端末では WebAssembly）で端末内で行う。

- 姿勢推定（YOLO26 Pose）と、2投球のフォーム比較（棒人間ビューア・加速度ベクトル）
- 投球の軌跡と平均球速（試験的）: 投手の後ろから撮った1球分の動画から、キャップの軌跡を映像に重ね、平均球速を推定する。フォーム比較とは撮る向きが違う別の機能

## モデル

| 用途 | 重み | 入手元 |
|---|---|---|
| 姿勢推定 | YOLO26 n / s / m Pose | Ultralytics 公式 |
| キャップ・役割検出 | `yolo26m-1280px-120epoch.pt`（YOLO26m-P2・11クラス, 入力 1280・元フレームで学習） | このリポジトリの Release `cap-detector-y26m-1280` |

ONNX への書き出しは CI で行い、GitHub Pages に同梱する。重みは git には入れない。

## ライセンス

AGPL-3.0。Ultralytics YOLO（AGPL-3.0）のモデルを利用しているため。

## 開発

```bash
pnpm install
uv run --with-requirements tools/requirements.txt python tools/export_models.py   # モデルを public/models/ に書き出す（初回のみ）
pnpm dev        # http://localhost:5173/cap-pose-lab/
pnpm test
```

`/cap-pose-lab/diagnostics.html` は診断ページ。環境の判定結果と、いちばん軽いモデルでの推論1回の結果を表示する（動かないときの問い合わせ用）。

## 実機での確認（iPhone / Android）

CI では GPU を使った推論を確かめられないため、公開後に実機で次を確認する。

1. https://koshien2015.github.io/cap-pose-lab/ を Safari（Android は Chrome）で開く
2. 「はじめる」→ 環境の判定が ◎ になるか（「詳しい情報」に GPU の情報が出るか）
3. カメラで撮った縦向きの動画（HEVC・60fps）を選び、「ふつう」で解析する
4. 解析時間と、投手の枠が縦向きの映像に正しく重なるかを確認する
5. pose.json を保存し、「ファイル」アプリに保存されるかを確認する

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

診断ページ（`diagnostics.html`）の「キャップ検出で推論を試す」で、キャップ検出モデルの推論1回の時間を測れる。手元では `?ep=wasm`（CPU 処理）と `?detector=<ファイル名>`（別の ONNX との比較。manifest が fp16 のとき `export_models.py --keep-fp32` で fp32 を残せる）を付けられる。
