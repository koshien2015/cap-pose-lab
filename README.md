# cap-pose-lab

キャップ野球の投球動画を、ブラウザの中だけで解析するツール（開発中）。
動画はサーバに送信されない。推論は WebGPU（使えない端末では WebAssembly）で端末内で行う。

- 姿勢推定（YOLO26 Pose）と、2投球のフォーム比較（棒人間ビューア・加速度ベクトル）
- キャップ検出と投球軌跡（試験的）

## モデル

| 用途 | 重み | 入手元 |
|---|---|---|
| 姿勢推定 | YOLO26 n / s / m Pose | Ultralytics 公式 |
| キャップ・役割検出 | `yolo8m_20250510.pt`（11クラス, 入力 640 で学習） | このリポジトリの Release `cap-detector-20250510` |

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
