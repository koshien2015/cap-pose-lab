# cap-pose-lab 計画1: 土台と姿勢推定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スマホのブラウザで1〜2本の投球動画から投手の骨格を取り出し、pose.json として書き出せる公開サイトを GitHub Pages に出す（iPhone 実機計測ができる状態にする）。

**Architecture:** Vite + React の静的サイト。推論は onnxruntime-web（WebGPU 優先、無ければ wasm）、動画は mp4box + WebCodecs でフレーム単位にデコード。推論・追跡・書き出しは DOM に依存しない純粋関数に分け、画面はステップ形式。モデル（YOLO26 Pose の ONNX）は CI で書き出して Pages に同梱し、git には入れない。

**Tech Stack:** Vite, React, TypeScript, Tailwind CSS v4, Vitest + Testing Library, zod, onnxruntime-web 1.30.0, mp4box 2.4.1, Python（ultralytics 8.4.53, CI の ONNX 書き出しのみ）, GitHub Actions + GitHub Pages

**Spec:** `docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md`（本計画は §4, §5, §6 の画面 0〜6・9, §7, §10 の一部を実装する。§8 解析移植と metrics.json・§6.2 ビューア・画面 7・§9 キャップ検出（画面 3 のチェックを含む）・撮影ガイドとサンプル動画・§10 の途中再開（IndexedDB）・E2E は計画2〜5）

**移植元（検証ページ）:** 事前検証で作ったブラウザ実行ベンチ（非公開リポジトリ）の推論まわりのコード。以下 `SPIKE` と書く。取り出しコマンドの `<SPIKE_REPO>`・`<SPIKE_COMMIT>`・`<SPIKE_DIR>` は、手元のそのリポジトリのパス・コミット・ディレクトリ。ブランチが消えても取り出せるよう、コミットで指定して手元の v3 リポジトリから取り出す（シェル関数は使わない。コマンドはステップごとに直書きしてある）。

## Global Constraints

- リポジトリ: `cap-pose-lab`（`koshien2015/cap-pose-lab`, 公開, AGPL-3.0）。既定ブランチ `main`
- コミットの Author は `ckoshien <ckoshien@gmail.com>`（リポジトリのローカル設定。済み）。メッセージは `<type>: <日本語の説明>` で、末尾に `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` を付ける
- パッケージマネージャは pnpm、Node 22 以上
- `onnxruntime-web` は **1.30.0 固定**（`^` を付けない）。`mp4box` は 2.4.1
- ultralytics は **8.4.53 固定**（CI の ONNX 書き出し）
- 公開パスは `/cap-pose-lab/`。アセットの URL は必ず `import.meta.env.BASE_URL` から組み立てる
- 姿勢推定モデルは fp32 のみ配信（fp16 は検証で約2倍遅かった）。入力サイズは 960。人物の信頼度しきい値は 0.25
- ORT の `env.wasm.wasmPaths` は `{ mjs, wasm }` の両方を明示する（省略するとスレッド用 Worker が止まる）
- `alert` / `confirm` / `prompt` は使わない。同意とエラーは画面内パネルで出す
- タップ領域は 44px 以上（Tailwind の `min-h-11`）。ホバーに頼らない
- 主画面の文言に専門用語（WebGPU, wasm, ONNX, fp32 など）を出さない。技術情報は `<details>`「詳しい情報」の中だけ
- モデルは自動でダウンロードしない。サイズを見せて許可を取ってから取得する
- pose.json は `SCHEMA_VERSION 1`（`ultralytics/shared/pose_export.py` と同形式）。推論したフレームは投手がいなくても `[null, null, 0.0]` で記録し、推論していないフレームは記録しない
- 1ファイル 800 行以内、関数 50 行以内を目安。オブジェクトは変更せず新しく作る（イミュータブル）

## Review Focus

- iPhone の縦動画（回転メタデータ 90°/270°）: キーポイントは表示の向き（縦長）の座標で出るべき → Task 6 に `rotationFromMatrix` と `displaySize` のテストを追加
- 投手が一部のフレームで隠れる・見失う: 追跡は最後に見えた位置から続け、見えないフレームは「投手なし」として記録する（別人を拾ったり、作った値で埋めたりしない）→ Task 8・Task 9 にテストを追加
- 長すぎる・大きすぎる動画（例: 60秒の 4K）: ダウンロードや推論を始める前に、やさしい文言で断る → Task 6 に `checkVideoLimits` のテストを追加
- ダウンロードが途中で切れる・失敗する: 壊れたモデルをキャッシュに残さず、エラーを出し、再試行で取り直せる → Task 7 にテストを追加
- fps や解像度が違う2本の動画: pose.json はそれぞれ自分の fps とタイムスタンプを持つ → Task 9 にテストを追加

---

## ファイル構成

```
cap-pose-lab/
  index.html
  package.json, pnpm-lock.yaml, tsconfig*.json, vite.config.ts
  .github/workflows/pages.yml         CI: ONNX 書き出し → テスト → ビルド → Pages
  public/models/manifest.json         モデル一覧（ONNX 本体は CI で生成、git 管理外）
  scripts/copy-ort-wasm.mjs           ORT の wasm を public/ort/ へ複製（predev/prebuild）
  tools/export_models.py              manifest に従い ONNX を書き出す
  tools/requirements.txt
  src/
    main.tsx, App.tsx, index.css
    test/setup.ts
    inference/
      letterbox.ts          レターボックス（SPIKE から）
      decodePose.ts         YOLO26 Pose 出力の解読（SPIKE から）
      eta.ts                残り時間（SPIKE から）
      capabilities.ts       環境判定（検出のみ）
      recommend.ts          判定 → 使えるモード・おすすめ
      manifest.ts           manifest の検証と読み込み（zod）
      estimate.ts           推定時間
      speedStore.ts         実測速度の保存
      videoSource.ts        mp4box + WebCodecs（SPIKE から）
      videoLimits.ts        長さ・サイズの上限
      frameCanvas.ts        回転込みの描画・テンソル化・縮小画像（SPIKE から）
      ortSession.ts         ORT の読み込み・セッション（SPIKE から, パス修正）
      modelStore.ts         モデルの取得とキャッシュ
      runPose.ts            1本分の推論パイプライン
    tracking/
      pitcherTracking.ts    投手の初期選択・タップ選択・IoU 追跡
    export/
      poseJson.ts           pose.json（SCHEMA_VERSION 1）への変換
    content/
      errors.ts             エラー → やさしい文言
    ui/
      StartScreen.tsx, EnvStatus.tsx, VideoPicker.tsx, ModePicker.tsx,
      DownloadConsent.tsx, RunProgress.tsx, PitcherConfirm.tsx, ExportPanel.tsx,
      useWakeLock.ts, download.ts
```

---

### Task 1: プロジェクトの土台（Vite + React + Tailwind + Vitest）

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json` ほか Vite テンプレート一式, `src/test/setup.ts`, `src/App.tsx`, `src/index.css`, `src/App.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `pnpm dev` / `pnpm build` / `pnpm test` / `pnpm test:coverage`。`@` エイリアスは使わない（相対 import）

- [ ] **Step 1: Vite テンプレートを展開する**

先に `pnpm create vite@latest --help` を見て、「インストールして起動するか」などの対話を出さないオプション（例: `--no-interactive` / `--no-immediate`）があれば下のコマンドに付ける。対話が出た場合は「いいえ」を選ぶ。

```bash
cd cap-pose-lab
pnpm create vite@latest tmp-scaffold --template react-ts
cp -R tmp-scaffold/. . && rm -rf tmp-scaffold
rm -f src/App.css src/assets/react.svg public/vite.svg
pnpm install
pnpm add -D tailwindcss @tailwindcss/vite vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
pnpm add zod mp4box@2.4.1 onnxruntime-web@1.30.0
```

`README.md` と `.gitignore` はテンプレートで上書きされるので、`git checkout -- README.md .gitignore` で戻す。

テンプレートの `tsconfig.app.json` の `compilerOptions` を確認し、有効になっている厳しい設定（`strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters` など）を控えておく。**以降のタスクでこれらに引っかかったら、設定を緩めずにコードの側を直す**（例: `erasableSyntaxOnly` ではコンストラクタ引数プロパティ `constructor(private readonly x)` が使えないので、フィールド宣言と代入に書き換える）。

- [ ] **Step 2: `vite.config.ts` を書く**

```ts
/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/cap-pose-lab/',
  plugins: [react(), tailwindcss()],
  // ORT は wasm を自前で読み込むので事前バンドルしない
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/inference/**/*.ts', 'src/tracking/**/*.ts', 'src/export/**/*.ts', 'src/content/**/*.ts'],
      // ブラウザ API に直結する層は E2E（計画4）で見る
      exclude: [
        'src/inference/videoSource.ts',
        'src/inference/frameCanvas.ts',
        'src/inference/ortSession.ts',
        'src/inference/runPose.ts',
        'src/inference/capabilities.ts',
        '**/*.test.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

- [ ] **Step 3: `package.json` の scripts を置き換える**

```json
"scripts": {
  "predev": "node scripts/copy-ort-wasm.mjs",
  "dev": "vite",
  "prebuild": "node scripts/copy-ort-wasm.mjs",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "lint": "eslint ."
}
```

- [ ] **Step 4: ORT の wasm を複製するスクリプト `scripts/copy-ort-wasm.mjs`**

```js
// onnxruntime-web の wasm 本体を public/ort/ に複製する（npm パッケージと同一バージョンを同一オリジンから配信するため）。
// WebGPU 実行は jsep ビルドを使う。
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// require 条件の解決先は dist/ort.min.js なので、その親が dist
const dist = dirname(require.resolve('onnxruntime-web'));
const out = join(process.cwd(), 'public', 'ort');
mkdirSync(out, { recursive: true });
for (const name of ['ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs']) {
  copyFileSync(join(dist, name), join(out, name));
}
console.log(`copied onnxruntime-web wasm to ${out}`);
```

- [ ] **Step 5: `.gitignore` に生成物を追加する**

```
public/ort/
```

（`*.onnx` と `public/models/*.onnx` は既に入っている）

- [ ] **Step 6: テスト設定と最小の画面**

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

`src/index.css`:

```css
@import 'tailwindcss';

:root {
  color-scheme: light dark;
}

body {
  margin: 0;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  font-family: system-ui, -apple-system, 'Hiragino Sans', sans-serif;
}
```

`src/App.tsx`（Task 10 で置き換える仮の画面）:

```tsx
export function App() {
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-xl font-bold">投球フォーム解析</h1>
    </main>
  );
}
```

`src/main.tsx` を `import { App } from './App'` と `import './index.css'` を使う形に直す（テンプレートの `App.css` の import を消す）。

`src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('タイトルを表示する', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '投球フォーム解析' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: テストとビルドが通ることを確認する**

Run: `pnpm test && pnpm build`
Expected: テスト 1 件 PASS、`dist/` が生成され `dist/ort/ort-wasm-simd-threaded.jsep.wasm` がある

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: Vite + React + Tailwind + Vitest の土台を作る" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 推論の純粋関数を移植（レターボックス・出力の解読・残り時間）

**Files:**
- Create: `src/inference/letterbox.ts`, `src/inference/decodePose.ts`, `src/inference/eta.ts`
- Test: `src/inference/letterbox.test.ts`, `src/inference/decodePose.test.ts`, `src/inference/eta.test.ts`

**Interfaces:**
- Produces:
  - `computeLetterbox(srcWidth: number, srcHeight: number, imgsz: number): Letterbox`（`{ scale, newWidth, newHeight, padLeft, padTop, inputWidth, inputHeight }`）
  - `rgbaToChw(rgba: Uint8ClampedArray, width: number, height: number): Float32Array`
  - `PAD_VALUE = 114`
  - `decodePeople(output: Float32Array, lb: Letterbox, confThreshold: number): Person[]`
  - `type Person = { box: readonly [number, number, number, number]; score: number; keypoints: readonly Keypoint[] }`, `type Keypoint = readonly [x, y, conf]`, `NUM_KEYPOINTS = 17`
  - `estimateRemainingMs(elapsedMs: number, done: number, total: number): number | null`
  - `formatDuration(ms: number | null): string`

- [ ] **Step 1: 実装を SPIKE から持ってくる**

```bash
git -C <SPIKE_REPO> show <SPIKE_COMMIT>:<SPIKE_DIR>/letterbox.ts > src/inference/letterbox.ts
git -C <SPIKE_REPO> show <SPIKE_COMMIT>:<SPIKE_DIR>/decodePose.ts > src/inference/decodePose.ts
git -C <SPIKE_REPO> show <SPIKE_COMMIT>:<SPIKE_DIR>/eta.ts > src/inference/eta.ts
git -C <SPIKE_REPO> show <SPIKE_COMMIT>:<SPIKE_DIR>/__tests__/eta.test.ts | sed "s#'../eta'#'./eta'#" > src/inference/eta.test.ts
```

- [ ] **Step 2: レターボックスと解読のテストを書く**

`src/inference/letterbox.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { computeLetterbox, rgbaToChw, toSourceX, toSourceY } from './letterbox';

describe('computeLetterbox', () => {
  it('1920x1080 を 960 にすると 960x544（上下 2px パディング）', () => {
    expect(computeLetterbox(1920, 1080, 960)).toEqual({
      scale: 0.5, newWidth: 960, newHeight: 540, padLeft: 0, padTop: 2, inputWidth: 960, inputHeight: 544,
    });
  });

  it('縦動画 1080x1920 を 960 にすると 544x960', () => {
    const lb = computeLetterbox(1080, 1920, 960);
    expect([lb.inputWidth, lb.inputHeight]).toEqual([544, 960]);
    expect(lb.padLeft).toBe(2);
  });

  it('不正な入力は例外にする', () => {
    expect(() => computeLetterbox(0, 1080, 960)).toThrow();
    expect(() => computeLetterbox(1920, 1080, 0)).toThrow();
  });

  it('入力座標を元フレーム座標に戻せる', () => {
    const lb = computeLetterbox(1920, 1080, 960);
    expect(toSourceX(480, lb)).toBe(960);
    expect(toSourceY(272, lb)).toBe(540);
  });
});

describe('rgbaToChw', () => {
  it('RGBA を R/G/B の面に分けて 0-1 にする', () => {
    const chw = Array.from(rgbaToChw(new Uint8ClampedArray([255, 0, 51, 255, 0, 255, 102, 255]), 2, 1));
    [1, 0, 0, 1, 0.2, 0.4].forEach((v, i) => expect(chw[i]).toBeCloseTo(v, 6));
  });

  it('画素数が合わなければ例外にする', () => {
    expect(() => rgbaToChw(new Uint8ClampedArray(4), 2, 1)).toThrow();
  });
});
```

`src/inference/decodePose.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { decodePeople, NUM_KEYPOINTS } from './decodePose';
import { computeLetterbox } from './letterbox';

function row(box: number[], score: number, kpt: [number, number, number]): number[] {
  return [...box, score, 0, ...Array.from({ length: NUM_KEYPOINTS }, () => kpt).flat()];
}

describe('decodePeople', () => {
  const lb = computeLetterbox(1920, 1080, 960);

  it('しきい値未満を捨て、座標を元フレームに戻す', () => {
    const out = new Float32Array([...row([10, 12, 110, 212], 0.9, [50, 102, 0.8]), ...row([0, 0, 1, 1], 0.1, [0, 0, 0])]);
    const people = decodePeople(out, lb, 0.25);
    expect(people).toHaveLength(1);
    expect(people[0].box).toEqual([20, 20, 220, 420]);
    expect(people[0].keypoints[0][0]).toBeCloseTo(100);
    expect(people[0].keypoints[0][1]).toBeCloseTo(200);
    expect(people[0].keypoints[0][2]).toBeCloseTo(0.8);
  });

  it('出力の長さが 57 の倍数でなければ例外にする', () => {
    expect(() => decodePeople(new Float32Array(10), lb, 0.25)).toThrow();
  });

  it('誰もいなければ空配列', () => {
    expect(decodePeople(new Float32Array(row([0, 0, 1, 1], 0.1, [0, 0, 0])), lb, 0.25)).toEqual([]);
  });
});
```

- [ ] **Step 3: テストを実行する**

Run: `pnpm vitest run src/inference`
Expected: PASS（letterbox 6, decodePose 3, eta 4）

- [ ] **Step 4: Commit**

```bash
git add src/inference
git commit -m "feat: レターボックス・姿勢推定の出力解読・残り時間を移植" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: モデル一覧（manifest）と CI での ONNX 書き出し・Pages 配信

**Files:**
- Create: `public/models/manifest.json`, `src/inference/manifest.ts`, `src/inference/manifest.test.ts`, `tools/export_models.py`, `tools/requirements.txt`, `.github/workflows/pages.yml`

**Interfaces:**
- Produces:
  - `type ModeId = 'fast' | 'standard' | 'detailed'`
  - `type PoseModel = { id: ModeId; label: string; description: string; weights: string; file: string; imgsz: number; sizeMB: number; output: 'yolo26-end2end' }`
  - `type Manifest = { version: 1; pose: PoseModel[] }`（`pose` は `sizeMB` の昇順＝軽い順に並べ替え済み）
  - `parseManifest(json: unknown): Manifest`（不正なら `Error`）
  - `loadManifest(fetchImpl?: typeof fetch): Promise<Manifest>`（`${BASE_URL}models/manifest.json`）
  - `modelUrl(model: PoseModel): string`（`${BASE_URL}models/${file}`）

- [ ] **Step 1: `public/models/manifest.json` を書く**

```json
{
  "version": 1,
  "pose": [
    {
      "id": "detailed",
      "label": "くわしい",
      "description": "いちばん正確。時間とダウンロード量がいちばん多い",
      "weights": "yolo26m-pose.pt",
      "file": "yolo26m-pose.fp32.onnx",
      "imgsz": 960,
      "sizeMB": 84,
      "output": "yolo26-end2end"
    },
    {
      "id": "fast",
      "label": "はやい",
      "description": "すぐ終わる。細かい角度は少しずれることがある",
      "weights": "yolo26n-pose.pt",
      "file": "yolo26n-pose.fp32.onnx",
      "imgsz": 960,
      "sizeMB": 12.5,
      "output": "yolo26-end2end"
    },
    {
      "id": "standard",
      "label": "ふつう",
      "description": "速さと正確さのバランスがよい",
      "weights": "yolo26s-pose.pt",
      "file": "yolo26s-pose.fp32.onnx",
      "imgsz": 960,
      "sizeMB": 41,
      "output": "yolo26-end2end"
    }
  ]
}
```

（わざと順不同にしておき、`parseManifest` が軽い順に並べ替えることをテストで確かめる）

- [ ] **Step 2: 失敗するテストを書く** — `src/inference/manifest.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import manifestJson from '../../public/models/manifest.json';
import { loadManifest, modelUrl, parseManifest } from './manifest';

describe('parseManifest', () => {
  it('同梱の manifest を読めて、軽い順（sizeMB 昇順）に並ぶ', () => {
    const m = parseManifest(manifestJson);
    expect(m.pose.map((p) => p.id)).toEqual(['fast', 'standard', 'detailed']);
  });

  it('必須項目が欠けていれば例外にする', () => {
    expect(() => parseManifest({ version: 1, pose: [{ id: 'fast' }] })).toThrow();
  });

  it('未知のモード ID は例外にする', () => {
    const bad = { version: 1, pose: [{ ...manifestJson.pose[0], id: 'turbo' }] };
    expect(() => parseManifest(bad)).toThrow();
  });

  it('pose が空なら例外にする', () => {
    expect(() => parseManifest({ version: 1, pose: [] })).toThrow();
  });
});

describe('modelUrl / loadManifest', () => {
  it('BASE_URL 配下の models/ を指す', () => {
    const m = parseManifest(manifestJson);
    expect(modelUrl(m.pose[0])).toBe(`${import.meta.env.BASE_URL}models/yolo26n-pose.fp32.onnx`);
  });

  it('取得に失敗したら分かる例外にする', async () => {
    const failing = async () => new Response('', { status: 404 });
    await expect(loadManifest(failing as typeof fetch)).rejects.toThrow('モデル一覧');
  });
});
```

`tsconfig.app.json` の `compilerOptions` に `"resolveJsonModule": true` が無ければ追加する。

- [ ] **Step 3: テストが失敗することを確認する**

Run: `pnpm vitest run src/inference/manifest.test.ts`
Expected: FAIL（`./manifest` が無い）

- [ ] **Step 4: 実装する** — `src/inference/manifest.ts`

```ts
/**
 * モデル一覧（public/models/manifest.json）の検証と読み込み。
 * 重みの差し替えは manifest の書き換えだけで済むようにし、コードにモデル名を書かない。
 */

import { z } from 'zod';

const MODE_IDS = ['fast', 'standard', 'detailed'] as const;
export type ModeId = (typeof MODE_IDS)[number];

const PoseModelSchema = z.object({
  id: z.enum(MODE_IDS),
  label: z.string().min(1),
  description: z.string().min(1),
  weights: z.string().min(1),
  file: z.string().min(1),
  imgsz: z.number().int().positive(),
  sizeMB: z.number().positive(),
  output: z.literal('yolo26-end2end'),
});

const ManifestSchema = z.object({
  version: z.literal(1),
  pose: z.array(PoseModelSchema).min(1),
});

export type PoseModel = z.infer<typeof PoseModelSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export function parseManifest(json: unknown): Manifest {
  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`モデル一覧の形式が不正です: ${parsed.error.message}`);
  }
  return { ...parsed.data, pose: [...parsed.data.pose].sort((a, b) => a.sizeMB - b.sizeMB) };
}

export function modelUrl(model: PoseModel): string {
  return `${import.meta.env.BASE_URL}models/${model.file}`;
}

export async function loadManifest(fetchImpl: typeof fetch = fetch): Promise<Manifest> {
  const res = await fetchImpl(`${import.meta.env.BASE_URL}models/manifest.json`);
  if (!res.ok) throw new Error(`モデル一覧を取得できません（HTTP ${res.status}）`);
  return parseManifest(await res.json());
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm vitest run src/inference/manifest.test.ts`
Expected: PASS（6件）

- [ ] **Step 6: ONNX 書き出しスクリプト** — `tools/requirements.txt`

```
ultralytics==8.4.53
onnx
onnxslim
onnxruntime
```

`tools/export_models.py`:

```python
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
```

- [ ] **Step 7: 手元で書き出しを試す**

Run: `uv run --with-requirements tools/requirements.txt python tools/export_models.py && ls -la public/models`
Expected: `yolo26{n,s,m}-pose.fp32.onnx`（約 13 / 43 / 88 MB）ができる。`git status` に `.onnx` が出ない（gitignore 済み）

- [ ] **Step 8: CI の workflow** — `.github/workflows/pages.yml`

```yaml
name: pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: モデルのキャッシュ
        id: models
        uses: actions/cache@v4
        with:
          path: public/models/*.onnx
          key: models-${{ hashFiles('public/models/manifest.json', 'tools/export_models.py', 'tools/requirements.txt') }}

      - uses: actions/setup-python@v5
        if: steps.models.outputs.cache-hit != 'true'
        with:
          python-version: '3.12'

      - name: ONNX を書き出す
        if: steps.models.outputs.cache-hit != 'true'
        run: |
          pip install torch --index-url https://download.pytorch.org/whl/cpu
          pip install -r tools/requirements.txt
          python tools/export_models.py

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm test:coverage
      - run: pnpm build

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`package.json` に `"packageManager": "pnpm@10.19.0"` を追加する（`pnpm/action-setup` がバージョンを読む）。

- [ ] **Step 9: Commit**

```bash
git add public/models/manifest.json src/inference/manifest.ts src/inference/manifest.test.ts tools .github package.json tsconfig.app.json
git commit -m "feat: モデル一覧と CI での ONNX 書き出し・Pages 配信を追加" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 環境判定とおすすめモード

**Files:**
- Create: `src/inference/capabilities.ts`, `src/inference/recommend.ts`
- Test: `src/inference/recommend.test.ts`

**Interfaces:**
- Consumes: `ModeId`（Task 3）
- Produces:
  - `type CapabilityReport`（下記コードのとおり。`isMobile: boolean` を含む）
  - `detectCapabilities(): Promise<CapabilityReport>`
  - `type ExecutionProvider = 'webgpu' | 'wasm'`
  - `type Recommendation = { verdict: 'ok' | 'limited' | 'unsupported'; executionProvider: ExecutionProvider | null; allowedModes: ModeId[]; recommendedMode: ModeId | null; messages: string[] }`
  - `recommend(report: CapabilityReport): Recommendation`

- [ ] **Step 1: 失敗するテストを書く** — `src/inference/recommend.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import type { CapabilityReport } from './capabilities';
import { recommend } from './recommend';

const base: CapabilityReport = {
  userAgent: 'test',
  isMobile: false,
  hardwareConcurrency: 8,
  deviceMemoryGB: 8,
  secureContext: true,
  crossOriginIsolated: false,
  gpu: { apiPresent: true, adapterFound: true, shaderF16: true, isFallbackAdapter: false },
  webCodecs: true,
  codecs: [{ label: 'H.264', codec: 'avc1.640028', supported: true }],
  wasm: true,
  wasmSimd: true,
  wasmThreads: false,
};

describe('recommend', () => {
  it('GPU が使えればすべてのモードを選べて、おすすめは「ふつう」', () => {
    const r = recommend(base);
    expect(r.verdict).toBe('ok');
    expect(r.executionProvider).toBe('webgpu');
    expect(r.allowedModes).toEqual(['fast', 'standard', 'detailed']);
    expect(r.recommendedMode).toBe('standard');
  });

  it('メモリが 4GB 以下の端末は「はやい」をすすめる', () => {
    expect(recommend({ ...base, deviceMemoryGB: 4 }).recommendedMode).toBe('fast');
  });

  it('GPU が無ければ「はやい」だけを選べて、理由を出す', () => {
    const r = recommend({ ...base, gpu: { apiPresent: false, adapterFound: false, shaderF16: false } });
    expect(r.verdict).toBe('limited');
    expect(r.executionProvider).toBe('wasm');
    expect(r.allowedModes).toEqual(['fast']);
    expect(r.messages.join()).toContain('高速モード');
  });

  it('ソフトウェア実装の GPU は使えないものとして扱う', () => {
    const r = recommend({ ...base, gpu: { ...base.gpu, isFallbackAdapter: true } });
    expect(r.executionProvider).toBe('wasm');
  });

  it('動画を読めない環境では何も選べない', () => {
    const r = recommend({ ...base, webCodecs: false });
    expect(r.verdict).toBe('unsupported');
    expect(r.allowedModes).toEqual([]);
    expect(r.recommendedMode).toBeNull();
    expect(r.messages.join()).toContain('動画');
  });

  it('HTTPS でなければ何も選べない', () => {
    expect(recommend({ ...base, secureContext: false }).verdict).toBe('unsupported');
  });

  it('主画面向けの文言に専門用語を含めない', () => {
    const texts = [
      ...recommend(base).messages,
      ...recommend({ ...base, gpu: { apiPresent: false, adapterFound: false, shaderF16: false } }).messages,
      ...recommend({ ...base, webCodecs: false }).messages,
    ].join();
    expect(texts).not.toMatch(/WebGPU|wasm|WebCodecs|ONNX/i);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run src/inference/recommend.test.ts`
Expected: FAIL（`./capabilities` と `./recommend` が無い）

- [ ] **Step 3: 環境判定を書く** — `src/inference/capabilities.ts`（SPIKE の検出部分に `isMobile` を足したもの。おすすめは `recommend.ts` に分ける）

```ts
/**
 * ブラウザで姿勢推定を動かせるかの判定（検出だけ。判断は recommend.ts）。
 */

export interface GpuReport {
  readonly apiPresent: boolean;
  readonly adapterFound: boolean;
  readonly vendor?: string;
  readonly architecture?: string;
  readonly description?: string;
  readonly isFallbackAdapter?: boolean;
  readonly shaderF16: boolean;
  readonly maxBufferSizeMB?: number;
  readonly maxStorageBufferBindingSizeMB?: number;
  readonly error?: string;
}

export interface CodecReport {
  readonly label: string;
  readonly codec: string;
  readonly supported: boolean;
}

export interface CapabilityReport {
  readonly userAgent: string;
  readonly isMobile: boolean;
  readonly hardwareConcurrency: number;
  readonly deviceMemoryGB?: number;
  readonly secureContext: boolean;
  readonly crossOriginIsolated: boolean;
  readonly gpu: GpuReport;
  readonly webCodecs: boolean;
  readonly codecs: readonly CodecReport[];
  readonly wasm: boolean;
  readonly wasmSimd: boolean;
  readonly wasmThreads: boolean;
}

// 最小限の WebGPU 型（TS の lib.dom には未収録）
interface GpuAdapterLike {
  readonly features: { has(name: string): boolean };
  readonly limits: { maxBufferSize: number; maxStorageBufferBindingSize: number };
  readonly info?: { vendor?: string; architecture?: string; description?: string; isFallbackAdapter?: boolean };
  readonly isFallbackAdapter?: boolean;
}
interface GpuLike {
  requestAdapter(options?: { powerPreference?: string }): Promise<GpuAdapterLike | null>;
}

const CODECS: readonly Omit<CodecReport, 'supported'>[] = [
  { label: 'H.264 1080p30', codec: 'avc1.640028' },
  { label: 'H.264 1080p60', codec: 'avc1.64002A' },
  { label: 'HEVC 1080p（iPhone 標準）', codec: 'hvc1.1.6.L123.B0' },
  { label: 'HEVC 10bit（iPhone HDR）', codec: 'hvc1.2.4.L123.B0' },
];

// wasm-feature-detect の SIMD 判定用モジュール
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

const MB = 1024 * 1024;

async function detectGpu(): Promise<GpuReport> {
  const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
  if (!gpu) return { apiPresent: false, adapterFound: false, shaderF16: false };
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { apiPresent: true, adapterFound: false, shaderF16: false, error: 'アダプタを取得できません' };
    return {
      apiPresent: true,
      adapterFound: true,
      vendor: adapter.info?.vendor,
      architecture: adapter.info?.architecture,
      description: adapter.info?.description,
      isFallbackAdapter: adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter,
      shaderF16: adapter.features.has('shader-f16'),
      maxBufferSizeMB: Math.round(adapter.limits.maxBufferSize / MB),
      maxStorageBufferBindingSizeMB: Math.round(adapter.limits.maxStorageBufferBindingSize / MB),
    };
  } catch (error) {
    return { apiPresent: true, adapterFound: false, shaderF16: false, error: String(error) };
  }
}

async function detectCodecs(): Promise<CodecReport[]> {
  if (typeof VideoDecoder === 'undefined') return CODECS.map((c) => ({ ...c, supported: false }));
  return Promise.all(
    CODECS.map(async (c) => {
      try {
        const res = await VideoDecoder.isConfigSupported({ codec: c.codec, codedWidth: 1920, codedHeight: 1080 });
        return { ...c, supported: Boolean(res.supported) };
      } catch {
        return { ...c, supported: false };
      }
    }),
  );
}

export async function detectCapabilities(): Promise<CapabilityReport> {
  const wasm = typeof WebAssembly === 'object';
  const [gpu, codecs] = await Promise.all([detectGpu(), detectCodecs()]);
  return {
    userAgent: navigator.userAgent,
    isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    hardwareConcurrency: navigator.hardwareConcurrency ?? 1,
    deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    secureContext: window.isSecureContext,
    crossOriginIsolated: window.crossOriginIsolated === true,
    gpu,
    webCodecs: typeof VideoDecoder !== 'undefined',
    codecs,
    wasm,
    wasmSimd: wasm && WebAssembly.validate(SIMD_PROBE),
    wasmThreads: wasm && typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated === true,
  };
}
```

- [ ] **Step 4: おすすめを書く** — `src/inference/recommend.ts`

```ts
/**
 * 環境判定の結果から、選べる解析モードとおすすめを決める。
 * 画面に出す文言なので専門用語を使わない。
 */

import type { CapabilityReport } from './capabilities';
import type { ModeId } from './manifest';

export type ExecutionProvider = 'webgpu' | 'wasm';

export interface Recommendation {
  readonly verdict: 'ok' | 'limited' | 'unsupported';
  readonly executionProvider: ExecutionProvider | null;
  readonly allowedModes: readonly ModeId[];
  readonly recommendedMode: ModeId | null;
  readonly messages: readonly string[];
}

const ALL_MODES: readonly ModeId[] = ['fast', 'standard', 'detailed'];
const LOW_MEMORY_GB = 4;

function unsupportedReasons(report: CapabilityReport): string[] {
  const reasons: string[] = [];
  if (!report.secureContext) reasons.push('このページは https で開いてください');
  if (!report.webCodecs || !report.codecs.some((c) => c.supported)) {
    reasons.push('このブラウザでは動画を1コマずつ読み込めません。最新の Safari か Chrome で開いてください');
  }
  if (!report.wasm) reasons.push('このブラウザは解析に必要な機能に対応していません');
  return reasons;
}

export function recommend(report: CapabilityReport): Recommendation {
  const reasons = unsupportedReasons(report);
  if (reasons.length > 0) {
    return { verdict: 'unsupported', executionProvider: null, allowedModes: [], recommendedMode: null, messages: reasons };
  }
  const gpuOk = report.gpu.adapterFound && report.gpu.isFallbackAdapter !== true;
  if (!gpuOk) {
    return {
      verdict: 'limited',
      executionProvider: 'wasm',
      allowedModes: ['fast'],
      recommendedMode: 'fast',
      messages: ['この端末は高速モードに対応していないため、「はやい」だけを選べます。解析には少し時間がかかります'],
    };
  }
  const lowMemory = report.deviceMemoryGB !== undefined && report.deviceMemoryGB <= LOW_MEMORY_GB;
  return {
    verdict: 'ok',
    executionProvider: 'webgpu',
    allowedModes: ALL_MODES,
    recommendedMode: lowMemory ? 'fast' : 'standard',
    messages: ['この端末は高速モードで解析できます'],
  };
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm vitest run src/inference/recommend.test.ts`
Expected: PASS（7件）

- [ ] **Step 6: Commit**

```bash
git add src/inference/capabilities.ts src/inference/recommend.ts src/inference/recommend.test.ts
git commit -m "feat: 環境判定と解析モードのおすすめを追加" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 推定時間と実測速度の保存

**Files:**
- Create: `src/inference/estimate.ts`, `src/inference/speedStore.ts`
- Test: `src/inference/estimate.test.ts`, `src/inference/speedStore.test.ts`

**Interfaces:**
- Consumes: `ModeId`（Task 3）, `ExecutionProvider`（Task 4）
- Produces:
  - `estimateSeconds(frames: number, mode: ModeId, ep: ExecutionProvider, opts: { isMobile: boolean; measuredMsPerFrame?: number }): number`
  - `loadMeasuredSpeed(mode: ModeId, ep: ExecutionProvider, storage?: Storage): number | undefined`
  - `saveMeasuredSpeed(mode: ModeId, ep: ExecutionProvider, msPerFrame: number, storage?: Storage): void`

- [ ] **Step 1: 失敗するテストを書く**

`src/inference/estimate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { estimateSeconds } from './estimate';

describe('estimateSeconds', () => {
  it('実測があればそれを使う', () => {
    expect(estimateSeconds(100, 'standard', 'webgpu', { isMobile: false, measuredMsPerFrame: 50 })).toBe(5);
  });

  it('実測が無ければ端末の種類から見積もる（スマホは PC の3倍）', () => {
    const pc = estimateSeconds(100, 'standard', 'webgpu', { isMobile: false });
    const phone = estimateSeconds(100, 'standard', 'webgpu', { isMobile: true });
    expect(phone).toBeCloseTo(pc * 3);
  });

  it('軽いモードほど短い', () => {
    const opts = { isMobile: false };
    const [fast, standard, detailed] = (['fast', 'standard', 'detailed'] as const).map((m) =>
      estimateSeconds(149, m, 'webgpu', opts),
    );
    expect(fast).toBeLessThan(standard);
    expect(standard).toBeLessThan(detailed);
  });

  it('0 フレームなら 0 秒', () => {
    expect(estimateSeconds(0, 'fast', 'webgpu', { isMobile: false })).toBe(0);
  });

  it('不正な実測値（0 や NaN）は無視する', () => {
    const fallback = estimateSeconds(100, 'fast', 'webgpu', { isMobile: false });
    expect(estimateSeconds(100, 'fast', 'webgpu', { isMobile: false, measuredMsPerFrame: 0 })).toBe(fallback);
    expect(estimateSeconds(100, 'fast', 'webgpu', { isMobile: false, measuredMsPerFrame: Number.NaN })).toBe(fallback);
  });
});
```

`src/inference/speedStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { loadMeasuredSpeed, saveMeasuredSpeed } from './speedStore';

describe('speedStore', () => {
  beforeEach(() => localStorage.clear());

  it('保存した実測値を読み出せる', () => {
    saveMeasuredSpeed('fast', 'webgpu', 31.5);
    expect(loadMeasuredSpeed('fast', 'webgpu')).toBe(31.5);
    expect(loadMeasuredSpeed('fast', 'wasm')).toBeUndefined();
  });

  it('ストレージが使えなくても例外にしない', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    } as unknown as Storage;
    expect(() => saveMeasuredSpeed('fast', 'webgpu', 10, broken)).not.toThrow();
    expect(loadMeasuredSpeed('fast', 'webgpu', broken)).toBeUndefined();
  });

  it('壊れた値は無視する', () => {
    localStorage.setItem('capPoseLab.speed.fast.webgpu', 'abc');
    expect(loadMeasuredSpeed('fast', 'webgpu')).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run src/inference/estimate.test.ts src/inference/speedStore.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`src/inference/estimate.ts`:

```ts
/**
 * 解析にかかる時間の見積もり。
 * 基準値は Mac Chrome の実測（計画書・設計書 §6.1）。スマホは未計測なので3倍で仮置きし、
 * 一度解析したら実測値（speedStore）に置き換わる。
 */

import type { ModeId } from './manifest';
import type { ExecutionProvider } from './recommend';

const BASE_MS_PER_FRAME: Record<ModeId, Record<ExecutionProvider, number>> = {
  fast: { webgpu: 30, wasm: 500 },
  standard: { webgpu: 50, wasm: 1500 },
  detailed: { webgpu: 95, wasm: 4000 },
};
const MOBILE_FACTOR = 3;

export function estimateSeconds(
  frames: number,
  mode: ModeId,
  ep: ExecutionProvider,
  opts: { isMobile: boolean; measuredMsPerFrame?: number },
): number {
  const measured = opts.measuredMsPerFrame;
  const msPerFrame =
    measured !== undefined && Number.isFinite(measured) && measured > 0
      ? measured
      : BASE_MS_PER_FRAME[mode][ep] * (opts.isMobile ? MOBILE_FACTOR : 1);
  return (frames * msPerFrame) / 1000;
}
```

`src/inference/speedStore.ts`:

```ts
/**
 * 端末ごとの実測速度（ミリ秒/フレーム）を localStorage に残す。推定時間の精度を上げるためだけに使う。
 */

import type { ModeId } from './manifest';
import type { ExecutionProvider } from './recommend';

const key = (mode: ModeId, ep: ExecutionProvider) => `capPoseLab.speed.${mode}.${ep}`;

function defaultStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadMeasuredSpeed(
  mode: ModeId,
  ep: ExecutionProvider,
  storage: Storage | undefined = defaultStorage(),
): number | undefined {
  try {
    const value = Number(storage?.getItem(key(mode, ep)));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveMeasuredSpeed(
  mode: ModeId,
  ep: ExecutionProvider,
  msPerFrame: number,
  storage: Storage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(key(mode, ep), String(msPerFrame));
  } catch {
    // 保存できなくても見積もりが粗くなるだけ
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/inference/estimate.test.ts src/inference/speedStore.test.ts`
Expected: PASS（8件）

- [ ] **Step 5: Commit**

```bash
git add src/inference/estimate.ts src/inference/speedStore.ts src/inference/estimate.test.ts src/inference/speedStore.test.ts
git commit -m "feat: 解析時間の見積もりと実測速度の保存を追加" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 動画の読み込み（回転対応）と長さの上限

**Files:**
- Create: `src/inference/videoSource.ts`, `src/inference/frameCanvas.ts`, `src/inference/videoLimits.ts`
- Test: `src/inference/videoSource.test.ts`, `src/inference/videoLimits.test.ts`

**Interfaces:**
- Consumes: `computeLetterbox`, `rgbaToChw`, `PAD_VALUE`（Task 2）
- Produces:
  - `type VideoInfo = { codec; codedWidth; codedHeight; rotation: 0|90|180|270; fps; frameCount; durationSec; fileSizeMB }`
  - `type DemuxedVideo = { info: VideoInfo; config: VideoDecoderConfig; chunks: readonly EncodedVideoChunk[] }`
  - `demuxVideo(file: File): Promise<DemuxedVideo>`
  - `decodeFrames(video: DemuxedVideo, limit?: number): AsyncGenerator<VideoFrame>`（受け取った側が `close()`）
  - `rotationFromMatrix(matrix: ArrayLike<number>): 0 | 90 | 180 | 270`
  - `displaySize(frame: { displayWidth: number; displayHeight: number }, rotation): { width; height }`
  - `class FramePreprocessor(imgsz: number, rotation)` の `toTensor(frame: VideoFrame): { tensor: Float32Array; letterbox: Letterbox }`
  - `makeThumbnail(frame: VideoFrame, rotation): ImageBitmap`（長辺 `THUMB_LONG_EDGE = 320`）
  - `thumbnailSize(width, height, longEdge?): { width; height }`、`thumbnailStride(frameCount, maxThumbnails?): number`（`MAX_THUMBNAILS = 300`）
  - `checkVideoLimits(info: VideoInfo): { ok: true } | { ok: false; message: string }`
  - `MAX_DURATION_SEC = 20`, `MAX_FRAMES = 1200`, `MAX_FILE_MB = 300`

- [ ] **Step 1: 実装を SPIKE から持ってくる**

```bash
git -C <SPIKE_REPO> show <SPIKE_COMMIT>:<SPIKE_DIR>/videoSource.ts > src/inference/videoSource.ts
# テストできるように回転の関数を公開する
sed -i '' 's/^function rotationFromMatrix/export function rotationFromMatrix/' src/inference/videoSource.ts
grep -n "export function rotationFromMatrix" src/inference/videoSource.ts
```

Expected: 1行表示される

`src/inference/frameCanvas.ts` は SPIKE を元に次の3点を変えて書く: コンストラクタ引数プロパティをやめる（`erasableSyntaxOnly` 対策）、縮小画像を**長辺** 320px にする（縦動画で 320×569 にならないように）、縮小画像を何コマおきに残すかを決める関数を足す（1本あたり最大 300 枚。スマホのメモリ対策）。

```ts
/**
 * VideoFrame を回転込みで canvas に描き、YOLO 入力テンソルやプレビュー用の縮小画像を作る。
 */

import { computeLetterbox, type Letterbox, PAD_VALUE, rgbaToChw } from './letterbox';
import type { VideoInfo } from './videoSource';

type Rotation = VideoInfo['rotation'];

/** 縮小画像の長辺(px)。縦動画でも横動画でも1枚あたり 320x180 相当に収める */
export const THUMB_LONG_EDGE = 320;
/** 1本あたりに残す縮小画像の上限。320x180x4 バイト x 300 枚 ≒ 69MB */
export const MAX_THUMBNAILS = 300;

export function displaySize(
  frame: { displayWidth: number; displayHeight: number },
  rotation: Rotation,
): { width: number; height: number } {
  const swap = rotation === 90 || rotation === 270;
  return swap
    ? { width: frame.displayHeight, height: frame.displayWidth }
    : { width: frame.displayWidth, height: frame.displayHeight };
}

export function thumbnailSize(width: number, height: number, longEdge: number = THUMB_LONG_EDGE): { width: number; height: number } {
  const scale = longEdge / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** 何コマおきに縮小画像を残すか（1 = 全コマ） */
export function thumbnailStride(frameCount: number, maxThumbnails: number = MAX_THUMBNAILS): number {
  return Math.max(1, Math.ceil(frameCount / maxThumbnails));
}

function drawRotated(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: VideoFrame,
  rotation: Rotation,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const swap = rotation === 90 || rotation === 270;
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const w = swap ? height : width;
  const h = swap ? width : height;
  ctx.drawImage(frame, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function context2d(canvas: OffscreenCanvas, willReadFrequently: boolean): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently });
  if (!ctx) throw new Error('canvas 2D コンテキストを取得できません');
  return ctx;
}

export class FramePreprocessor {
  private readonly imgsz: number;
  private readonly rotation: Rotation;
  private canvas: OffscreenCanvas | null = null;
  private letterbox: Letterbox | null = null;

  constructor(imgsz: number, rotation: Rotation) {
    this.imgsz = imgsz;
    this.rotation = rotation;
  }

  toTensor(frame: VideoFrame): { tensor: Float32Array; letterbox: Letterbox } {
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
    const image = ctx.getImageData(0, 0, lb.inputWidth, lb.inputHeight);
    return { tensor: rgbaToChw(image.data, lb.inputWidth, lb.inputHeight), letterbox: lb };
  }
}

export function makeThumbnail(frame: VideoFrame, rotation: Rotation): ImageBitmap {
  const shown = displaySize(frame, rotation);
  const size = thumbnailSize(shown.width, shown.height);
  const canvas = new OffscreenCanvas(size.width, size.height);
  drawRotated(context2d(canvas, false), frame, rotation, 0, 0, size.width, size.height);
  return canvas.transferToImageBitmap();
}
```

- [ ] **Step 2: 回転と上限のテストを書く**

`src/inference/videoSource.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { displaySize, thumbnailSize, thumbnailStride } from './frameCanvas';
import { rotationFromMatrix } from './videoSource';

// ISO BMFF の tkhd 行列（16.16 固定小数）。[a, b, u, c, d, v, x, y, w]
const FIXED = 0x10000;
const matrixFor = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  const cos = Math.round(Math.cos(r)) * FIXED;
  const sin = Math.round(Math.sin(r)) * FIXED;
  return [cos, sin, 0, -sin, cos, 0, 0, 0, 0x40000000];
};

describe('rotationFromMatrix', () => {
  it.each([0, 90, 180, 270])('%i° を読み取る', (deg) => {
    expect(rotationFromMatrix(matrixFor(deg))).toBe(deg);
  });

  it('想定外の角度は 0 とみなす', () => {
    expect(rotationFromMatrix([46341, 46341, 0, -46341, 46341, 0, 0, 0, 0x40000000])).toBe(0);
  });
});

describe('thumbnailSize / thumbnailStride', () => {
  it('縦動画でも長辺 320px に収める（320x569 にしない）', () => {
    expect(thumbnailSize(1080, 1920)).toEqual({ width: 180, height: 320 });
    expect(thumbnailSize(1920, 1080)).toEqual({ width: 320, height: 180 });
  });

  it('縮小画像は1本あたり最大 300 枚になるよう間引く', () => {
    expect(thumbnailStride(149)).toBe(1);
    expect(thumbnailStride(300)).toBe(1);
    expect(thumbnailStride(301)).toBe(2);
    expect(thumbnailStride(1200)).toBe(4);
  });
});

describe('displaySize', () => {
  const frame = { displayWidth: 1920, displayHeight: 1080 };

  it('iPhone の縦動画（90°）は縦長として扱う', () => {
    expect(displaySize(frame, 90)).toEqual({ width: 1080, height: 1920 });
    expect(displaySize(frame, 270)).toEqual({ width: 1080, height: 1920 });
  });

  it('0° と 180° はそのまま', () => {
    expect(displaySize(frame, 0)).toEqual({ width: 1920, height: 1080 });
    expect(displaySize(frame, 180)).toEqual({ width: 1920, height: 1080 });
  });
});
```

`src/inference/videoLimits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { VideoInfo } from './videoSource';
import { checkVideoLimits } from './videoLimits';

const info: VideoInfo = {
  codec: 'avc1.640029', codedWidth: 1920, codedHeight: 1080, rotation: 0,
  fps: 60, frameCount: 300, durationSec: 5, fileSizeMB: 20,
};

describe('checkVideoLimits', () => {
  it('数秒の動画は通す', () => {
    expect(checkVideoLimits(info)).toEqual({ ok: true });
  });

  it('長すぎる動画は切り出しを案内して断る', () => {
    const r = checkVideoLimits({ ...info, durationSec: 60, frameCount: 3600 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('20秒');
  });

  it('大きすぎるファイル（4K など）は断る', () => {
    const r = checkVideoLimits({ ...info, fileSizeMB: 800 });
    expect(r.ok).toBe(false);
  });

  it('フレームが1枚も無い動画は断る', () => {
    expect(checkVideoLimits({ ...info, frameCount: 0 }).ok).toBe(false);
  });

  it('高 fps で短い動画でも、フレーム数が上限を超えれば断る', () => {
    expect(checkVideoLimits({ ...info, fps: 240, durationSec: 10, frameCount: 2400 }).ok).toBe(false);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `pnpm vitest run src/inference/videoSource.test.ts src/inference/videoLimits.test.ts`
Expected: videoSource の回転テストは PASS（移植済み）、`thumbnailSize` 系と videoLimits は FAIL（未実装・モジュールが無い）。先に Step 1 の frameCanvas.ts を書いた場合は thumbnail 系も PASS

- [ ] **Step 4: 上限チェックを実装する** — `src/inference/videoLimits.ts`

```ts
/**
 * 解析を始める前の動画チェック。スマホでメモリ不足にならない範囲に収める。
 */

import type { VideoInfo } from './videoSource';

export const MAX_DURATION_SEC = 20;
export const MAX_FRAMES = 1200;
export const MAX_FILE_MB = 300;

export type LimitResult = { ok: true } | { ok: false; message: string };

export function checkVideoLimits(info: VideoInfo): LimitResult {
  if (info.frameCount <= 0) {
    return { ok: false, message: 'この動画からは映像を読み取れませんでした。別の動画を選んでください' };
  }
  if (info.durationSec > MAX_DURATION_SEC || info.frameCount > MAX_FRAMES) {
    return {
      ok: false,
      message: `動画が長すぎます（${Math.round(info.durationSec)}秒）。投球の前後だけ、${MAX_DURATION_SEC}秒以内に切り出してから選んでください`,
    };
  }
  if (info.fileSizeMB > MAX_FILE_MB) {
    return {
      ok: false,
      message: 'ファイルが大きすぎます。カメラの解像度を 1080p（フルHD）にして撮り直すか、短く切り出してください',
    };
  }
  return { ok: true };
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm vitest run src/inference/videoSource.test.ts src/inference/videoLimits.test.ts && pnpm tsc -b`
Expected: PASS（videoSource 9, videoLimits 5）、型エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/inference/videoSource.ts src/inference/frameCanvas.ts src/inference/videoLimits.ts src/inference/videoSource.test.ts src/inference/videoLimits.test.ts
git commit -m "feat: 動画のフレーム読み込み（回転対応）と長さの上限チェックを追加" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: モデルの取得（進捗・キャッシュ）と ORT セッション

**Files:**
- Create: `src/inference/modelStore.ts`, `src/inference/ortSession.ts`
- Test: `src/inference/modelStore.test.ts`

**Interfaces:**
- Consumes: `ExecutionProvider`（Task 4）
- Produces:
  - `interface CacheLike { match(url: string): Promise<Response | undefined>; put(url: string, res: Response): Promise<void> }`
  - `openModelCache(): Promise<CacheLike | null>`
  - `class DownloadError extends Error`
  - `fetchModel(url: string, cache: CacheLike | null, onProgress: (receivedBytes: number, totalBytes: number) => void, fetchImpl?: typeof fetch, signal?: AbortSignal): Promise<Uint8Array>`（中止されたら `AbortError` の DOMException をそのまま投げる。DownloadError にしない）
  - `isModelCached(url: string, cache: CacheLike | null): Promise<boolean>`
  - `ORT_RUNTIME_MB = 27`
  - `loadOrt()`, `createSession(model: Uint8Array, ep: ExecutionProvider): Promise<LoadedSession>`（`{ session, createMs, warnings, wasmThreads }`）, `runPose(session, input: Float32Array, width: number, height: number): Promise<Float32Array>`

- [ ] **Step 1: 失敗するテストを書く** — `src/inference/modelStore.test.ts`

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { type CacheLike, DownloadError, fetchModel, isModelCached } from './modelStore';

class MemoryCache implements CacheLike {
  readonly store = new Map<string, Uint8Array>();
  async match(url: string) {
    const bytes = this.store.get(url);
    return bytes ? new Response(bytes) : undefined;
  }
  async put(url: string, res: Response) {
    this.store.set(url, new Uint8Array(await res.arrayBuffer()));
  }
}

function streamResponse(chunks: Uint8Array[], contentLength: number | null, status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
  const headers = contentLength === null ? undefined : { 'content-length': String(contentLength) };
  return new Response(body, { status, headers });
}

describe('fetchModel', () => {
  it('受信しながら進捗を出し、終わったらキャッシュに入れる', async () => {
    const cache = new MemoryCache();
    const progress = vi.fn();
    const fetchImpl = vi.fn(async () => streamResponse([new Uint8Array([1, 2]), new Uint8Array([3])], 3));
    const bytes = await fetchModel('/m.onnx', cache, progress, fetchImpl as unknown as typeof fetch);
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
    expect(await isModelCached('/m.onnx', cache)).toBe(true);
  });

  it('キャッシュにあれば取りに行かない', async () => {
    const cache = new MemoryCache();
    cache.store.set('/m.onnx', new Uint8Array([9]));
    const fetchImpl = vi.fn();
    const bytes = await fetchModel('/m.onnx', cache, () => undefined, fetchImpl as unknown as typeof fetch);
    expect(Array.from(bytes)).toEqual([9]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('途中で切れたら DownloadError にし、キャッシュに残さない', async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi.fn(async () => streamResponse([new Uint8Array([1])], 10));
    await expect(fetchModel('/m.onnx', cache, () => undefined, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(
      DownloadError,
    );
    expect(await isModelCached('/m.onnx', cache)).toBe(false);
  });

  it('HTTP エラーは DownloadError にする', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([], 0, 404));
    await expect(fetchModel('/m.onnx', null, () => undefined, fetchImpl as unknown as typeof fetch)).rejects.toThrow('404');
  });

  it('通信そのものの失敗も DownloadError にする', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchModel('/m.onnx', null, () => undefined, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(
      DownloadError,
    );
  });

  it('失敗のあと再試行すれば取り直せる', async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => streamResponse([new Uint8Array([1])], 2))
      .mockImplementationOnce(async () => streamResponse([new Uint8Array([1, 2])], 2));
    const f = fetchImpl as unknown as typeof fetch;
    await expect(fetchModel('/m.onnx', cache, () => undefined, f)).rejects.toBeInstanceOf(DownloadError);
    expect(Array.from(await fetchModel('/m.onnx', cache, () => undefined, f))).toEqual([1, 2]);
  });

  it('中止されたら AbortError を投げ、DownloadError にしない', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return streamResponse([new Uint8Array([1])], 1);
    });
    const promise = fetchModel('/m.onnx', null, () => undefined, fetchImpl as unknown as typeof fetch, controller.signal);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(promise).rejects.not.toBeInstanceOf(DownloadError);
  });

  it('Content-Length より多く届いたら DownloadError にする', async () => {
    const fetchImpl = vi.fn(async () => streamResponse([new Uint8Array([1, 2, 3])], 2));
    await expect(fetchModel('/m.onnx', null, () => undefined, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(
      DownloadError,
    );
  });

  it('Content-Length が無くても読める（進捗の合計は 0）', async () => {
    const progress = vi.fn();
    const fetchImpl = vi.fn(async () => streamResponse([new Uint8Array([5, 6])], null));
    const bytes = await fetchModel('/m.onnx', null, progress, fetchImpl as unknown as typeof fetch);
    expect(Array.from(bytes)).toEqual([5, 6]);
    expect(progress).toHaveBeenLastCalledWith(2, 0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run src/inference/modelStore.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する** — `src/inference/modelStore.ts`

```ts
/**
 * モデルの取得。受信しながら進捗を出し、最後まで受け取れたものだけを Cache Storage に残す
 * （2回目以降はダウンロードしない。途中で切れたものは残さない）。
 */

export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, res: Response): Promise<void>;
}

export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

/** 推論エンジン本体（ORT の wasm）の目安サイズ。ブラウザの HTTP キャッシュ任せ */
export const ORT_RUNTIME_MB = 27;

const CACHE_NAME = 'cap-pose-lab-models-v1';

export async function openModelCache(): Promise<CacheLike | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null; // プライベートブラウズなどで使えない
  }
}

export async function isModelCached(url: string, cache: CacheLike | null): Promise<boolean> {
  if (!cache) return false;
  try {
    return (await cache.match(url)) !== undefined;
  } catch {
    return false;
  }
}

/** 大きさが分かっているときは最初に確保して直接書き込む（受信中にモデル2つ分のメモリを使わないため） */
async function readAll(res: Response, onProgress: (received: number, total: number) => void): Promise<Uint8Array> {
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    onProgress(bytes.byteLength, total);
    return bytes;
  }
  const reader = res.body.getReader();
  const preallocated = total > 0 ? new Uint8Array(total) : null;
  const parts: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (preallocated) {
      if (received + value.byteLength > total) {
        throw new DownloadError(`想定より大きなデータが届きました（${received + value.byteLength}/${total} バイト）`);
      }
      preallocated.set(value, received);
    } else {
      parts.push(value);
    }
    received += value.byteLength;
    onProgress(received, total);
  }
  if (preallocated) {
    if (received !== total) throw new DownloadError(`ダウンロードが途中で切れました（${received}/${total} バイト）`);
    return preallocated;
  }
  const out = new Uint8Array(received);
  parts.reduce((offset, part) => {
    out.set(part, offset);
    return offset + part.byteLength;
  }, 0);
  return out;
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export async function fetchModel(
  url: string,
  cache: CacheLike | null,
  onProgress: (receivedBytes: number, totalBytes: number) => void,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const cached = cache ? await cache.match(url).catch(() => undefined) : undefined;
  if (cached) return new Uint8Array(await cached.arrayBuffer());

  let res: Response;
  try {
    res = await fetchImpl(url, { signal });
  } catch (error) {
    if (isAbort(error)) throw error; // 中止は失敗扱いにしない
    throw new DownloadError(`通信できませんでした: ${String(error)}`);
  }
  if (!res.ok) throw new DownloadError(`モデルを取得できませんでした（HTTP ${res.status}）`);
  let bytes: Uint8Array;
  try {
    bytes = await readAll(res, onProgress);
  } catch (error) {
    if (isAbort(error) || error instanceof DownloadError) throw error;
    throw new DownloadError(`受信中に通信が切れました: ${String(error)}`);
  }
  if (cache) {
    await cache.put(url, new Response(bytes)).catch(() => undefined); // 容量不足でも解析は続ける
  }
  return bytes;
}
```

- [ ] **Step 4: ORT セッションを SPIKE から持ってきて、パスを公開パス基準にする**

```bash
git -C <SPIKE_REPO> show <SPIKE_COMMIT>:<SPIKE_DIR>/ortSession.ts > src/inference/ortSession.ts
sed -i '' "s#^const WASM_BASE = '/ort/';#const WASM_BASE = \`\${import.meta.env.BASE_URL}ort/\`;#" src/inference/ortSession.ts
# ExecutionProvider は recommend.ts に一本化する（re-export はしない）
sed -i '' "s#^export type ExecutionProvider = 'webgpu' | 'wasm';#import type { ExecutionProvider } from './recommend';#" src/inference/ortSession.ts
grep -n "WASM_BASE =\|ExecutionProvider\|export function isOrtRuntimeLoaded" src/inference/ortSession.ts
```

Expected: `const WASM_BASE = \`${import.meta.env.BASE_URL}ort/\`;`、`import type { ExecutionProvider } from './recommend';`、`export function isOrtRuntimeLoaded` が表示される

- [ ] **Step 5: テストと型チェック**

Run: `pnpm vitest run src/inference/modelStore.test.ts && pnpm tsc -b`
Expected: PASS（9件）、型エラーなし

- [ ] **Step 6: ORT が実際に動くかを診断ページで確かめる**（検証では Worker の読み込み違いとヘッダでセッション生成が2回止まった。本番の画面を作る前に確かめる）

`diagnostics.html`（プロジェクト直下）:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>診断 - 投球フォーム解析</title>
  </head>
  <body>
    <pre id="out">確認中…</pre>
    <script type="module" src="/src/diagnostics.ts"></script>
  </body>
</html>
```

`src/diagnostics.ts`（問い合わせ対応でも使う。環境判定と、いちばん軽いモデルでの推論1回を表示する）:

```ts
import { detectCapabilities } from './inference/capabilities';
import { loadManifest, modelUrl } from './inference/manifest';
import { fetchModel } from './inference/modelStore';
import { createSession, runPose } from './inference/ortSession';
import { recommend } from './inference/recommend';

const out = document.getElementById('out');
const log = (line: string) => {
  if (out) out.textContent = `${out.textContent === '確認中…' ? '' : out.textContent}${line}\n`;
};

async function main() {
  const report = await detectCapabilities();
  const rec = recommend(report);
  log(`判定: ${rec.verdict} / ${rec.executionProvider ?? '-'}`);
  log(JSON.stringify(report, null, 2));
  if (!rec.executionProvider) return;
  const manifest = await loadManifest();
  const bytes = await fetchModel(modelUrl(manifest.pose[0]), null, () => undefined);
  const { session, createMs } = await createSession(bytes, rec.executionProvider);
  const t0 = performance.now();
  const output = await runPose(session, new Float32Array(3 * 960 * 544), 960, 544);
  log(`セッション生成 ${Math.round(createMs)} ms / 推論1回 ${Math.round(performance.now() - t0)} ms / 出力 ${output.length} 要素`);
  await session.release();
  log('OK');
}

main().catch((e) => log(`失敗: ${String(e)}`));
```

`vite.config.ts` に診断ページをビルド対象として追加する:

```ts
  build: {
    rollupOptions: {
      input: { main: 'index.html', diagnostics: 'diagnostics.html' },
    },
  },
```

Run: `pnpm dev` → Chrome で `http://localhost:5173/cap-pose-lab/diagnostics.html` を開く
Expected: 最後に `出力 17100 要素`（300×57）と `OK` が出る。ネットワークに `ort-wasm-simd-threaded.jsep.mjs` と `.wasm` が 200 で読まれている。止まったまま `OK` が出ない場合は、`ortSession.ts` の `wasmPaths` が `{ mjs, wasm }` になっているか、Vite が `public/ort/*.mjs` をそのまま配信しているか（変換していないか）を確認する

Run: `pnpm build && pnpm preview` → `http://localhost:4173/cap-pose-lab/diagnostics.html`
Expected: 同じく `OK`（本番ビルドでもベースパス配下から ORT を読めること）

- [ ] **Step 7: Commit**

```bash
git add diagnostics.html src/diagnostics.ts vite.config.ts src/inference/modelStore.ts src/inference/modelStore.test.ts src/inference/ortSession.ts
git commit -m "feat: モデルの取得（進捗・キャッシュ・再試行）と ORT セッションを追加" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 投手の選択と追跡

**Files:**
- Create: `src/tracking/pitcherTracking.ts`
- Test: `src/tracking/pitcherTracking.test.ts`

**Interfaces:**
- Consumes: `Person`（Task 2）
- Produces:
  - `type Anchor = { frame: number; index: number }`（どのフレームのどの人物を投手とするか）
  - `iou(a: Box, b: Box): number`
  - `findInitialPitcher(frames: readonly (readonly Person[])[]): Anchor | null`（人物が写っている最初のフレームで最も大きい人物）
  - `personAtPoint(people: readonly Person[], x: number, y: number): number | null`（点を含む bbox のうち最小のもの）
  - `trackPitcher(frames: readonly (readonly Person[])[], anchor: Anchor, minIou?: number): (Person | null)[]`（長さは `frames.length`）
  - `DEFAULT_MIN_IOU = 0.2`

- [ ] **Step 1: 失敗するテストを書く** — `src/tracking/pitcherTracking.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import type { Person } from '../inference/decodePose';
import { findInitialPitcher, iou, personAtPoint, trackPitcher } from './pitcherTracking';

const person = (x1: number, y1: number, x2: number, y2: number): Person => ({
  box: [x1, y1, x2, y2],
  score: 0.9,
  keypoints: Array.from({ length: 17 }, () => [x1, y1, 0.9] as const),
});

describe('iou', () => {
  it('同じ箱は 1、離れた箱は 0', () => {
    expect(iou([0, 0, 10, 10], [0, 0, 10, 10])).toBe(1);
    expect(iou([0, 0, 10, 10], [20, 20, 30, 30])).toBe(0);
  });
});

describe('findInitialPitcher', () => {
  it('人物が写っている最初のフレームで、最も大きい人物を選ぶ', () => {
    const frames = [[], [person(0, 0, 10, 10), person(100, 0, 300, 400)]];
    expect(findInitialPitcher(frames)).toEqual({ frame: 1, index: 1 });
  });

  it('誰も写っていなければ null', () => {
    expect(findInitialPitcher([[], []])).toBeNull();
  });
});

describe('personAtPoint', () => {
  const people = [person(0, 0, 500, 500), person(100, 100, 200, 300)];

  it('重なっていれば小さいほう（手前の人）を選ぶ', () => {
    expect(personAtPoint(people, 150, 150)).toBe(1);
  });

  it('大きい箱だけに入る点ならそちら', () => {
    expect(personAtPoint(people, 400, 400)).toBe(0);
  });

  it('誰の箱にも入らなければ null', () => {
    expect(personAtPoint(people, 900, 900)).toBeNull();
  });
});

describe('trackPitcher', () => {
  it('前後のフレームへ、重なりの大きい人物をたどる', () => {
    const frames = [
      [person(0, 0, 100, 200), person(500, 0, 600, 200)],
      [person(5, 0, 105, 200), person(500, 0, 600, 200)],
      [person(500, 0, 600, 200), person(10, 0, 110, 200)],
    ];
    const track = trackPitcher(frames, { frame: 1, index: 0 });
    expect(track.map((p) => p?.box[0])).toEqual([0, 5, 10]);
  });

  it('見失ったフレームは null にし、別人を拾わない', () => {
    const frames = [
      [person(0, 0, 100, 200)],
      [person(800, 0, 900, 200)], // 投手は隠れていて、離れた位置の別人だけ写っている
      [person(4, 0, 104, 200)],
    ];
    const track = trackPitcher(frames, { frame: 0, index: 0 });
    expect(track[1]).toBeNull();
    expect(track[2]?.box[0]).toBe(4); // 最後に見えた位置から追跡を再開する
  });

  it('結果の長さはフレーム数と同じ', () => {
    const frames = [[person(0, 0, 10, 10)], [], [], [person(0, 0, 10, 10)]];
    expect(trackPitcher(frames, { frame: 0, index: 0 })).toHaveLength(4);
  });

  it('範囲外のアンカーは例外にする', () => {
    expect(() => trackPitcher([[person(0, 0, 1, 1)]], { frame: 0, index: 3 })).toThrow();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run src/tracking`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する** — `src/tracking/pitcherTracking.ts`

```ts
/**
 * 投手の特定と追跡。
 * 姿勢推定は人物を N 人返すだけなので、1フレームで投手を決め（自動 or タップ）、
 * 以降は bbox の重なり（IoU）で前後のフレームへたどる。
 * 見失ったフレームは null にする（別人を拾ったり、値を作って埋めたりしない）。
 */

import type { Person } from '../inference/decodePose';

type Box = readonly [number, number, number, number];

export interface Anchor {
  readonly frame: number;
  readonly index: number;
}

export const DEFAULT_MIN_IOU = 0.2;

const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

export function findInitialPitcher(frames: readonly (readonly Person[])[]): Anchor | null {
  const frame = frames.findIndex((people) => people.length > 0);
  if (frame < 0) return null;
  const people = frames[frame];
  const index = people.reduce((best, p, i) => (area(p.box) > area(people[best].box) ? i : best), 0);
  return { frame, index };
}

export function personAtPoint(people: readonly Person[], x: number, y: number): number | null {
  const hits = people
    .map((p, i) => ({ i, a: area(p.box), inside: x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3] }))
    .filter((h) => h.inside)
    .sort((m, n) => m.a - n.a);
  return hits.length > 0 ? hits[0].i : null;
}

function bestMatch(people: readonly Person[], last: Box, minIou: number): Person | null {
  const scored = people.map((p) => ({ p, overlap: iou(last, p.box) })).filter((s) => s.overlap >= minIou);
  if (scored.length === 0) return null;
  return scored.reduce((m, s) => (s.overlap > m.overlap ? s : m)).p;
}

function follow(
  frames: readonly (readonly Person[])[],
  order: readonly number[],
  start: Person,
  minIou: number,
): Map<number, Person | null> {
  const out = new Map<number, Person | null>();
  let last: Box = start.box;
  for (const i of order) {
    const found = bestMatch(frames[i], last, minIou);
    out.set(i, found);
    if (found) last = found.box;
  }
  return out;
}

export function trackPitcher(
  frames: readonly (readonly Person[])[],
  anchor: Anchor,
  minIou: number = DEFAULT_MIN_IOU,
): (Person | null)[] {
  const start = frames[anchor.frame]?.[anchor.index];
  if (!start) throw new Error(`アンカーが範囲外です: frame=${anchor.frame}, index=${anchor.index}`);
  const forward = Array.from({ length: frames.length - anchor.frame - 1 }, (_, k) => anchor.frame + 1 + k);
  const backward = Array.from({ length: anchor.frame }, (_, k) => anchor.frame - 1 - k);
  const found = new Map([
    ...follow(frames, forward, start, minIou),
    ...follow(frames, backward, start, minIou),
  ]);
  return frames.map((_, i) => (i === anchor.frame ? start : (found.get(i) ?? null)));
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/tracking`
Expected: PASS（10件）

- [ ] **Step 5: Commit**

```bash
git add src/tracking
git commit -m "feat: 投手の自動選択・タップ選択・IoU 追跡を追加" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 1本分の推論パイプラインと pose.json の書き出し

**Files:**
- Create: `src/inference/runPose.ts`, `src/export/poseJson.ts`
- Test: `src/export/poseJson.test.ts`

**Interfaces:**
- Consumes: `DemuxedVideo`, `decodeFrames`, `FramePreprocessor`, `makeThumbnail`, `displaySize`（Task 6）, `runPose as runOrt`（Task 7 の `ortSession.runPose`）, `decodePeople`, `Person`（Task 2）, `estimateRemainingMs`（Task 2）
- Produces:
  - `type PoseRun = { fileName: string; fps: number; width: number; height: number; frames: Person[][]; thumbnails: ImageBitmap[]; thumbStride: number; msPerFrame: number }`（`frames[i]` はフレーム i の全人物、元フレーム座標。縮小画像は `thumbStride` コマおきで、フレーム f の画像は `thumbnails[f / thumbStride]`）
  - `analyzeVideo(video: DemuxedVideo, fileName: string, session: InferenceSession, imgsz: number, opts: { onProgress: (done: number, total: number, etaMs: number | null) => void; signal: AbortSignal }): Promise<PoseRun>`
  - `KEYPOINT_NAMES`（COCO 17点、`pose_export.py` と同じ順）
  - `type PoseJson`、`toPoseJson(run: Pick<PoseRun, 'fileName' | 'fps'>, track: readonly (Person | null)[], meta: { modelLabel: string; selection: 'auto' | 'tap' }): PoseJson`
  - `poseJsonFileName(fileName: string): string`（`<動画名>_pose.json`）

- [ ] **Step 1: 失敗するテストを書く** — `src/export/poseJson.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import type { Person } from '../inference/decodePose';
import { KEYPOINT_NAMES, poseJsonFileName, toPoseJson } from './poseJson';

const person = (x: number): Person => ({
  box: [0, 0, 10, 10],
  score: 0.9,
  keypoints: Array.from({ length: 17 }, (_, k) => [x + k, 100.12345, 0.87654] as const),
});

describe('toPoseJson', () => {
  const run = { fileName: 'a.mov', fps: 60 };
  const json = toPoseJson(run, [person(1), null, person(3)], { modelLabel: 'yolo26s-pose@960', selection: 'auto' });

  it('SCHEMA_VERSION 1 の形で、推論したフレームをすべて記録する', () => {
    expect(json.schema_version).toBe(1);
    expect(json.frames).toHaveLength(3);
    expect(json.meta.pitch_id).toBe('a');
    expect(json.meta.fps).toBe(60);
    expect(json.meta.video_path).toBe('a.mov');
  });

  it('キーポイント名は COCO 17点で pose_export.py と同じ順', () => {
    expect(KEYPOINT_NAMES[0]).toBe('nose');
    expect(KEYPOINT_NAMES[16]).toBe('right_ankle');
    expect(Object.keys(json.frames[0].keypoints)).toEqual([...KEYPOINT_NAMES]);
  });

  it('座標は小数3桁、信頼度は4桁に丸める', () => {
    expect(json.frames[0].keypoints.nose).toEqual([1, 100.123, 0.8765]);
  });

  it('投手がいないフレームは [null, null, 0] で残す（作った値で埋めない）', () => {
    expect(json.frames[1].frame_index).toBe(1);
    expect(json.frames[1].keypoints.nose).toEqual([null, null, 0]);
  });

  it('タイムスタンプはその動画の fps から計算する', () => {
    expect(json.frames[2].timestamp_sec).toBeCloseTo(2 / 60, 6);
    const other = toPoseJson({ fileName: 'b.mp4', fps: 30 }, [person(0), person(0)], { modelLabel: 'm', selection: 'tap' });
    expect(other.meta.fps).toBe(30);
    expect(other.frames[1].timestamp_sec).toBeCloseTo(1 / 30, 6);
  });

  it('投手の選び方をメモに残す（自動選択は確認を促す）', () => {
    expect(json.meta.notes.join()).toContain('最も大きい人物');
    const tapped = toPoseJson(run, [person(1)], { modelLabel: 'm', selection: 'tap' });
    expect(tapped.meta.notes.join()).toContain('タップ');
  });

  it('座標が NaN なら null にする', () => {
    const broken: Person = { ...person(0), keypoints: person(0).keypoints.map(() => [Number.NaN, 1, 0.5] as const) };
    expect(toPoseJson(run, [broken], { modelLabel: 'm', selection: 'auto' }).frames[0].keypoints.nose[0]).toBeNull();
  });
});

describe('poseJsonFileName', () => {
  it('<動画名>_pose.json にする', () => {
    expect(poseJsonFileName('IMG_0001.MOV')).toBe('IMG_0001_pose.json');
    expect(poseJsonFileName('clip')).toBe('clip_pose.json');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run src/export`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 書き出しを実装する** — `src/export/poseJson.ts`

```ts
/**
 * 投手のキーポイント列を pose.json（SCHEMA_VERSION 1）にする。
 * 形式は ultralytics/shared/pose_export.py と同じで、Python 版の
 * `python -m pitching run --pose <file>` でもそのまま読める。
 * 推論したフレームは投手がいなくても記録し（[null, null, 0]）、推論していないフレームは記録しない。
 */

import type { Person } from '../inference/decodePose';

export const SCHEMA_VERSION = 1;

export const KEYPOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
] as const;

type KeypointValue = [number | null, number | null, number];

export interface PoseJson {
  readonly schema_version: number;
  readonly meta: {
    readonly pitch_id: string;
    readonly fps: number;
    readonly video_path: string;
    readonly adapter: string;
    readonly notes: readonly string[];
  };
  readonly frames: readonly {
    readonly frame_index: number;
    readonly timestamp_sec: number;
    readonly keypoints: Record<(typeof KEYPOINT_NAMES)[number], KeypointValue>;
  }[];
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));
const coord = (value: number) => (Number.isFinite(value) ? round(value, 3) : null);

function keypointsOf(person: Person | null): Record<(typeof KEYPOINT_NAMES)[number], KeypointValue> {
  const entries = KEYPOINT_NAMES.map((name, k): [string, KeypointValue] => {
    if (!person) return [name, [null, null, 0]];
    const [x, y, conf] = person.keypoints[k];
    return [name, [coord(x), coord(y), round(conf, 4)]];
  });
  return Object.fromEntries(entries) as Record<(typeof KEYPOINT_NAMES)[number], KeypointValue>;
}

const stem = (fileName: string) => fileName.replace(/\.[^.]+$/, '');

export function poseJsonFileName(fileName: string): string {
  return `${stem(fileName)}_pose.json`;
}

export function toPoseJson(
  run: { fileName: string; fps: number },
  track: readonly (Person | null)[],
  meta: { modelLabel: string; selection: 'auto' | 'tap' },
): PoseJson {
  const selectionNote =
    meta.selection === 'tap'
      ? '投手は画面のタップで選んだ'
      : '投手は最も大きい人物を自動で選んだ。別人を拾っていないか確認すること';
  return {
    schema_version: SCHEMA_VERSION,
    meta: {
      pitch_id: stem(run.fileName),
      fps: run.fps,
      video_path: run.fileName,
      adapter: `cap-pose-lab(${meta.modelLabel})`,
      notes: [selectionNote],
    },
    frames: track.map((person, frameIndex) => ({
      frame_index: frameIndex,
      timestamp_sec: round(frameIndex / run.fps, 6),
      keypoints: keypointsOf(person),
    })),
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm vitest run src/export`
Expected: PASS（8件）

- [ ] **Step 5: 推論パイプラインを実装する** — `src/inference/runPose.ts`（SPIKE の `runBenchmark` から計測専用の処理を除き、キャンセルと縮小画像を足したもの。ブラウザ API に直結するためユニットテストは無く、Task 11 の実機確認で見る）

```ts
/**
 * 1本の動画を最後まで推論する。フレームは1枚ずつ処理して閉じ、全フレームをメモリに溜めない。
 * 人物は全員分を残す（投手はあとで選び直せるように）。
 */

import type { InferenceSession } from 'onnxruntime-web';

import { decodePeople, type Person } from './decodePose';
import { estimateRemainingMs } from './eta';
import { displaySize, FramePreprocessor, makeThumbnail, thumbnailStride } from './frameCanvas';
import { runPose as runOrt } from './ortSession';
import { decodeFrames, type DemuxedVideo } from './videoSource';

export const CONF_THRESHOLD = 0.25;

export interface PoseRun {
  readonly fileName: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly frames: Person[][];
  readonly thumbnails: ImageBitmap[];
  /** 縮小画像を何コマおきに残したか。フレーム f の画像は thumbnails[f / thumbStride] */
  readonly thumbStride: number;
  readonly msPerFrame: number;
}

export async function analyzeVideo(
  video: DemuxedVideo,
  fileName: string,
  session: InferenceSession,
  imgsz: number,
  opts: { onProgress: (done: number, total: number, etaMs: number | null) => void; signal: AbortSignal },
): Promise<PoseRun> {
  const { rotation, frameCount, fps } = video.info;
  const preprocessor = new FramePreprocessor(imgsz, rotation);
  const frames: Person[][] = [];
  const thumbnails: ImageBitmap[] = [];
  const thumbStride = thumbnailStride(frameCount);
  let size = { width: 0, height: 0 };
  let inferMs = 0;
  const started = performance.now();
  try {
    for await (const frame of decodeFrames(video)) {
      try {
        opts.signal.throwIfAborted();
        if (frames.length === 0) size = displaySize(frame, rotation);
        const { tensor, letterbox } = preprocessor.toTensor(frame);
        const t0 = performance.now();
        const output = await runOrt(session, tensor, letterbox.inputWidth, letterbox.inputHeight);
        inferMs += performance.now() - t0;
        if (frames.length % thumbStride === 0) thumbnails.push(makeThumbnail(frame, rotation));
        frames.push(decodePeople(output, letterbox, CONF_THRESHOLD));
      } finally {
        frame.close();
      }
      opts.onProgress(frames.length, frameCount, estimateRemainingMs(performance.now() - started, frames.length, frameCount));
    }
  } catch (error) {
    thumbnails.forEach((t) => t.close());
    throw error;
  }
  return {
    fileName,
    fps,
    width: size.width,
    height: size.height,
    frames,
    thumbnails,
    thumbStride,
    msPerFrame: frames.length > 0 ? inferMs / frames.length : 0,
  };
}
```

- [ ] **Step 6: 型チェック**

Run: `pnpm tsc -b && pnpm test`
Expected: 型エラーなし、全テスト PASS

- [ ] **Step 7: Commit**

```bash
git add src/export src/inference/runPose.ts
git commit -m "feat: 1本分の推論パイプラインと pose.json の書き出しを追加" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: エラー文言とスマホ向けの画面（ステップ形式）

**Files:**
- Create: `src/content/errors.ts`, `src/content/errors.test.ts`, `src/ui/StartScreen.tsx`, `src/ui/EnvStatus.tsx`, `src/ui/VideoPicker.tsx`, `src/ui/ModePicker.tsx`, `src/ui/ModePicker.test.tsx`, `src/ui/DownloadConsent.tsx`, `src/ui/RunProgress.tsx`, `src/ui/PitcherConfirm.tsx`, `src/ui/ExportPanel.tsx`, `src/ui/useWakeLock.ts`, `src/ui/download.ts`
- Modify: `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: Task 2〜9 のすべて
- Produces:
  - `friendlyError(error: unknown): { title: string; action: string; detail: string }`
  - 画面コンポーネント（下記コード）

- [ ] **Step 1: エラー文言のテストを書く** — `src/content/errors.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import { DownloadError } from '../inference/modelStore';
import { friendlyError } from './errors';

describe('friendlyError', () => {
  it('ダウンロードの失敗は再試行と Wi-Fi をすすめる', () => {
    const e = friendlyError(new DownloadError('途中で切れました'));
    expect(e.title).toContain('ダウンロード');
    expect(e.action).toContain('Wi-Fi');
    expect(e.detail).toContain('途中で切れました');
  });

  it('キャンセルは失敗扱いにしない文言', () => {
    expect(friendlyError(new DOMException('aborted', 'AbortError')).title).toContain('中止');
  });

  it('デコードの失敗は撮影設定の変え方を案内する', () => {
    const e = friendlyError(new Error('デコードに失敗しました: bad'));
    expect(e.action).toContain('互換性優先');
  });

  it('セッションを作れないときは「はやい」をすすめる', () => {
    expect(friendlyError(new Error('セッションを作れませんでした（webgpu）: x')).action).toContain('はやい');
  });

  it('想定外のエラーも、次の行動を必ず示す', () => {
    const e = friendlyError('???');
    expect(e.title.length).toBeGreaterThan(0);
    expect(e.action.length).toBeGreaterThan(0);
  });

  it('主な文言に専門用語を出さない', () => {
    const all = [new DownloadError('x'), new Error('デコードに失敗しました'), new Error('セッションを作れませんでした')]
      .map(friendlyError)
      .flatMap((e) => [e.title, e.action])
      .join();
    expect(all).not.toMatch(/WebGPU|wasm|ONNX|WebCodecs|セッション/);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run src/content`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: エラー文言を実装する** — `src/content/errors.ts`

```ts
/**
 * 例外を「何が起きたか・次に何をすればよいか」の文言にする。技術的な内容は detail に回す。
 */

import { DownloadError } from '../inference/modelStore';

export interface FriendlyError {
  readonly title: string;
  readonly action: string;
  readonly detail: string;
}

const detailOf = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export function friendlyError(error: unknown): FriendlyError {
  const detail = detailOf(error);
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { title: '解析を中止しました', action: 'もう一度「解析をはじめる」を押すと、最初からやり直せます', detail };
  }
  if (error instanceof DownloadError) {
    return {
      title: 'ダウンロードに失敗しました',
      action: '通信の良い場所（できれば Wi-Fi）で「もう一度試す」を押してください',
      detail,
    };
  }
  if (detail.includes('デコード') || detail.includes('MP4/MOV') || detail.includes('映像トラック')) {
    return {
      title: 'この動画は読み込めませんでした',
      action: 'iPhone なら「設定 > カメラ > フォーマット」を「互換性優先」にして撮り直すと読み込めることがあります',
      detail,
    };
  }
  if (detail.includes('セッションを作れません')) {
    return {
      title: '解析の準備に失敗しました',
      action: 'ほかのアプリやタブを閉じてから、「はやい」モードで試してください',
      detail,
    };
  }
  return {
    title: 'うまく解析できませんでした',
    action: 'ページを再読み込みしてもう一度試してください。続く場合は「詳しい情報」をコピーして問い合わせてください',
    detail,
  };
}
```

- [ ] **Step 4: モード選択のテストを書く** — `src/ui/ModePicker.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import manifestJson from '../../public/models/manifest.json';
import { parseManifest } from '../inference/manifest';
import { ModePicker } from './ModePicker';

const models = parseManifest(manifestJson).pose;

describe('ModePicker', () => {
  it('軽い順に並び、おすすめに印が付く', () => {
    render(
      <ModePicker models={models} allowed={['fast', 'standard', 'detailed']} recommended="standard"
        estimateSec={() => 10} selected={null} onSelect={() => undefined} />,
    );
    const labels = screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
    expect(labels).toEqual(['はやい', 'ふつう', 'くわしい']);
    expect(screen.getByText('おすすめ')).toBeInTheDocument();
  });

  it('選べないモードは押せず、理由が分かる', async () => {
    const onSelect = vi.fn();
    render(
      <ModePicker models={models} allowed={['fast']} recommended="fast"
        estimateSec={() => 10} selected={null} onSelect={onSelect} />,
    );
    const detailed = screen.getByRole('radio', { name: 'くわしい' });
    expect(detailed).toBeDisabled();
    await userEvent.click(detailed);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getAllByText('この端末では選べません').length).toBe(2);
  });

  it('ダウンロード量と推定時間を表示する', () => {
    render(
      <ModePicker models={models} allowed={['fast', 'standard', 'detailed']} recommended="standard"
        estimateSec={(id) => (id === 'fast' ? 5 : 30)} selected={null} onSelect={() => undefined} />,
    );
    expect(screen.getByText(/約 13 MB/)).toBeInTheDocument();
    expect(screen.getByText(/約 5 秒/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: 画面の部品を実装する**

`src/ui/ModePicker.tsx`:

```tsx
import type { ModeId, PoseModel } from '../inference/manifest';
import { formatDuration } from '../inference/eta';

interface Props {
  readonly models: readonly PoseModel[];
  readonly allowed: readonly ModeId[];
  readonly recommended: ModeId | null;
  readonly estimateSec: (id: ModeId) => number;
  readonly selected: ModeId | null;
  readonly onSelect: (id: ModeId) => void;
}

export function ModePicker({ models, allowed, recommended, estimateSec, selected, onSelect }: Props) {
  return (
    <div role="radiogroup" aria-label="解析モード" className="space-y-3">
      {models.map((m) => {
        const enabled = allowed.includes(m.id);
        const active = selected === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-label={m.label}
            aria-checked={active}
            disabled={!enabled}
            onClick={() => enabled && onSelect(m.id)}
            className={`block w-full min-h-11 rounded-xl border-2 p-4 text-left disabled:opacity-40 ${
              active ? 'border-cyan-600 bg-cyan-600/10' : 'border-current/20'
            }`}
          >
            <span className="flex items-center gap-2 text-lg font-bold">
              {m.label}
              {recommended === m.id && enabled && (
                <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-xs text-white">おすすめ</span>
              )}
            </span>
            <span className="block text-sm">{m.description}</span>
            <span className="block text-sm opacity-80">
              ダウンロード 約 {Math.round(m.sizeMB)} MB・解析 {formatDuration(estimateSec(m.id) * 1000)}
            </span>
            {!enabled && <span className="block text-sm">この端末では選べません</span>}
          </button>
        );
      })}
    </div>
  );
}
```

`src/ui/StartScreen.tsx`:

```tsx
export function StartScreen({ onStart }: { readonly onStart: () => void }) {
  return (
    <section className="space-y-4">
      <p>スマホで撮った投球動画から、投手の体の動き（骨格）を取り出します。</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>動画はこの端末の中だけで解析します。どこにも送信しません</li>
        <li>投手の真横から、全身が入るように撮った数秒の動画が向いています</li>
        <li>2本選ぶと、あとでフォームを比べられます</li>
      </ul>
      <button type="button" onClick={onStart} className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white">
        はじめる
      </button>
    </section>
  );
}
```

`src/ui/EnvStatus.tsx`:

```tsx
import type { CapabilityReport } from '../inference/capabilities';
import type { Recommendation } from '../inference/recommend';

const MARK = { ok: '◎', limited: '△', unsupported: '×' } as const;

export function EnvStatus({ report, rec }: { readonly report: CapabilityReport | null; readonly rec: Recommendation | null }) {
  if (!report || !rec) return <p className="text-sm opacity-70">この端末で解析できるか確認しています…</p>;
  return (
    <section className="rounded-xl border border-current/20 p-3 text-sm">
      <p className="font-bold">
        {MARK[rec.verdict]} {rec.messages[0]}
      </p>
      {rec.messages.slice(1).map((m) => (
        <p key={m}>{m}</p>
      ))}
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2">詳しい情報</summary>
        <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(report, null, 2)}</pre>
      </details>
    </section>
  );
}
```

`src/ui/VideoPicker.tsx`:

```tsx
import type { DemuxedVideo } from '../inference/videoSource';

export interface PickedVideo {
  readonly file: File;
  readonly video: DemuxedVideo | null;
  readonly problem: string | null;
}

interface Props {
  readonly picked: readonly PickedVideo[];
  readonly onPick: (files: File[]) => void;
}

export function VideoPicker({ picked, onPick }: Props) {
  return (
    <section className="space-y-3">
      <label className="block w-full min-h-11 cursor-pointer rounded-xl border-2 border-dashed border-current/40 p-4 text-center">
        動画を選ぶ（1本 または 比べたい2本）
        <input
          type="file"
          accept="video/*"
          multiple
          className="sr-only"
          onChange={(e) => onPick(Array.from(e.target.files ?? []).slice(0, 2))}
        />
      </label>
      {picked.map((p) => (
        <div key={p.file.name} className="rounded-xl border border-current/20 p-3 text-sm">
          <p className="font-bold break-all">{p.file.name}</p>
          {p.video && (
            <p>
              {p.video.info.durationSec.toFixed(1)} 秒・{Math.round(p.video.info.fps)} コマ/秒
            </p>
          )}
          {p.problem && <p className="text-red-600">{p.problem}</p>}
        </div>
      ))}
    </section>
  );
}
```

`src/ui/DownloadConsent.tsx`:

```tsx
export interface DownloadItem {
  readonly label: string;
  readonly sizeMB: number;
}

interface Props {
  readonly items: readonly DownloadItem[];
  readonly onAccept: () => void;
  readonly onCancel: () => void;
}

export function DownloadConsent({ items, onAccept, onCancel }: Props) {
  const total = items.reduce((s, i) => s + i.sizeMB, 0);
  return (
    <section role="alertdialog" aria-label="ダウンロードの確認" className="space-y-3 rounded-xl border-2 border-amber-500 p-4">
      {items.length === 0 ? (
        <p>必要なデータはこの端末に保存済みです。すぐに解析できます。</p>
      ) : (
        <>
          <p className="font-bold">解析のために、約 {Math.round(total)} MB をダウンロードします</p>
          <ul className="list-disc pl-5 text-sm">
            {items.map((i) => (
              <li key={i.label}>
                {i.label}（約 {Math.round(i.sizeMB)} MB）
              </li>
            ))}
          </ul>
          <p className="text-sm">Wi-Fi での利用をおすすめします。一度ダウンロードすると、次からは不要です。</p>
        </>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onAccept} className="flex-1 min-h-11 rounded-xl bg-cyan-600 font-bold text-white">
          解析をはじめる
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-current/40 px-4">
          やめる
        </button>
      </div>
    </section>
  );
}
```

`src/ui/RunProgress.tsx`:

```tsx
export interface ProgressState {
  readonly label: string;
  readonly done: number;
  readonly total: number;
  readonly eta: string;
}

export function RunProgress({ state, onCancel }: { readonly state: ProgressState; readonly onCancel: () => void }) {
  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <section className="space-y-3" aria-live="polite">
      <p className="font-bold">{state.label}</p>
      <progress className="h-3 w-full" value={percent} max={100} />
      <p className="text-sm">
        {percent}%・残り {state.eta}
      </p>
      <p className="text-sm opacity-80">解析中はこの画面のままにしてください。ほかのアプリに切り替えると止まります。</p>
      <button type="button" onClick={onCancel} className="w-full min-h-11 rounded-xl border border-current/40">
        中止する
      </button>
    </section>
  );
}
```

`src/ui/PitcherConfirm.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

import type { Person } from '../inference/decodePose';
import type { PoseRun } from '../inference/runPose';
import { personAtPoint } from '../tracking/pitcherTracking';

interface Props {
  readonly run: PoseRun;
  readonly track: readonly (Person | null)[];
  readonly onPick: (frame: number, index: number) => void;
}

export function PitcherConfirm({ run, track, onPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stride = run.thumbStride;
  // 縮小画像のあるコマ（stride おき）だけを表示できる
  const firstFound = Math.max(0, track.findIndex((p, i) => p !== null && i % stride === 0));
  const [frame, setFrame] = useState(firstFound);
  const people = run.frames[frame] ?? [];
  const pitcher = track[frame];

  useEffect(() => {
    const canvas = canvasRef.current;
    const thumb = run.thumbnails[Math.floor(frame / stride)];
    const ctx = canvas?.getContext('2d');
    if (!canvas || !thumb || !ctx) return;
    canvas.width = thumb.width;
    canvas.height = thumb.height;
    ctx.drawImage(thumb, 0, 0);
    const scale = thumb.width / run.width;
    people.forEach((p) => {
      ctx.lineWidth = p === pitcher ? 4 : 2;
      ctx.strokeStyle = p === pitcher ? '#06b6d4' : 'rgba(255,255,255,0.7)';
      ctx.strokeRect(p.box[0] * scale, p.box[1] * scale, (p.box[2] - p.box[0]) * scale, (p.box[3] - p.box[1]) * scale);
    });
  }, [frame, people, pitcher, run]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * run.width;
    const y = ((e.clientY - rect.top) / rect.height) * run.height;
    const index = personAtPoint(people, x, y);
    if (index !== null) onPick(frame, index);
  };

  return (
    <section className="space-y-2">
      <p className="font-bold break-all">{run.fileName}</p>
      <p className="text-sm">青い枠が投手です。違う場合は投手をタップしてください。</p>
      <canvas ref={canvasRef} onPointerUp={onTap} className="w-full touch-manipulation rounded-xl" />
      <input
        type="range"
        min={0}
        max={Math.max(0, run.frames.length - 1)}
        step={stride}
        value={frame}
        onChange={(e) => setFrame(Number(e.target.value))}
        aria-label="表示するコマ"
        className="h-11 w-full"
      />
      {!pitcher && <p className="text-sm">このコマでは投手が見つかっていません。コマを動かすか、投手をタップしてください。</p>}
    </section>
  );
}
```

`src/ui/download.ts`:

```ts
/** JSON をファイルとして保存させる（iOS Safari では「ファイル」アプリに保存される）。 */
export function downloadJson(fileName: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
```

`src/ui/ExportPanel.tsx`:

```tsx
interface Item {
  readonly fileName: string;
  readonly onSave: () => void;
}

export function ExportPanel({ items }: { readonly items: readonly Item[] }) {
  return (
    <section className="space-y-2">
      <p className="font-bold">解析結果を保存する</p>
      {items.map((i) => (
        <button key={i.fileName} type="button" onClick={i.onSave} className="block w-full min-h-11 rounded-xl bg-cyan-600 px-4 font-bold text-white break-all">
          {i.fileName} を保存
        </button>
      ))}
      <p className="text-sm opacity-80">フォームの比較画面は準備中です。保存したファイルは、あとで比較に使えます。</p>
    </section>
  );
}
```

`src/ui/useWakeLock.ts`:

```ts
import { useEffect } from 'react';

/** active の間、画面が消えないようにする（対応していない端末では何もしない）。 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then(
      (s) => {
        sentinel = s;
      },
      () => undefined,
    );
    return () => {
      sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
```

- [ ] **Step 6: 画面をつなぐ** — `src/App.tsx`（ステップの進行と推論の実行。1ファイル 200 行程度に収める）

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { friendlyError, type FriendlyError } from './content/errors';
import { toPoseJson, poseJsonFileName } from './export/poseJson';
import { type CapabilityReport, detectCapabilities } from './inference/capabilities';
import type { Person } from './inference/decodePose';
import { estimateSeconds } from './inference/estimate';
import { formatDuration } from './inference/eta';
import { loadManifest, type Manifest, type ModeId, modelUrl } from './inference/manifest';
import { fetchModel, isModelCached, openModelCache, ORT_RUNTIME_MB } from './inference/modelStore';
import { createSession, isOrtRuntimeLoaded } from './inference/ortSession';
import { recommend } from './inference/recommend';
import { analyzeVideo, type PoseRun } from './inference/runPose';
import { loadMeasuredSpeed, saveMeasuredSpeed } from './inference/speedStore';
import { checkVideoLimits } from './inference/videoLimits';
import { demuxVideo } from './inference/videoSource';
import { findInitialPitcher, trackPitcher } from './tracking/pitcherTracking';
import { DownloadConsent, type DownloadItem } from './ui/DownloadConsent';
import { downloadJson } from './ui/download';
import { EnvStatus } from './ui/EnvStatus';
import { ExportPanel } from './ui/ExportPanel';
import { ModePicker } from './ui/ModePicker';
import { PitcherConfirm } from './ui/PitcherConfirm';
import { RunProgress, type ProgressState } from './ui/RunProgress';
import { StartScreen } from './ui/StartScreen';
import { type PickedVideo, VideoPicker } from './ui/VideoPicker';
import { useWakeLock } from './ui/useWakeLock';

type Step = 'start' | 'setup' | 'consent' | 'running' | 'result';

interface Tracked {
  readonly run: PoseRun;
  readonly track: (Person | null)[];
  readonly selection: 'auto' | 'tap';
}

function autoTrack(run: PoseRun): Tracked {
  const anchor = findInitialPitcher(run.frames);
  return { run, track: anchor ? trackPitcher(run.frames, anchor) : run.frames.map(() => null), selection: 'auto' };
}

export function App() {
  const [step, setStep] = useState<Step>('start');
  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [picked, setPicked] = useState<PickedVideo[]>([]);
  const [mode, setMode] = useState<ModeId | null>(null);
  const [consentItems, setConsentItems] = useState<DownloadItem[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ label: '', done: 0, total: 0, eta: '' });
  const [results, setResults] = useState<Tracked[]>([]);
  const [error, setError] = useState<FriendlyError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rec = useMemo(() => (report ? recommend(report) : null), [report]);
  useWakeLock(step === 'running');

  useEffect(() => {
    detectCapabilities().then(setReport, (e) => setError(friendlyError(e)));
    loadManifest().then(setManifest, (e) => setError(friendlyError(e)));
  }, []);
  useEffect(() => {
    if (rec?.recommendedMode && mode === null) setMode(rec.recommendedMode);
  }, [rec, mode]);

  const onPick = useCallback(async (files: File[]) => {
    setError(null);
    const loaded = await Promise.all(
      files.map(async (file): Promise<PickedVideo> => {
        try {
          const video = await demuxVideo(file);
          const limit = checkVideoLimits(video.info);
          return { file, video, problem: limit.ok ? null : limit.message };
        } catch (e) {
          return { file, video: null, problem: friendlyError(e).title };
        }
      }),
    );
    setPicked(loaded);
  }, []);

  const ready = picked.filter((p) => p.video && !p.problem);
  const totalFrames = ready.reduce((s, p) => s + (p.video?.info.frameCount ?? 0), 0);
  const model = manifest?.pose.find((m) => m.id === mode) ?? null;
  const ep = rec?.executionProvider ?? null;

  const estimateSec = (id: ModeId) =>
    ep ? estimateSeconds(totalFrames, id, ep, { isMobile: report?.isMobile ?? false, measuredMsPerFrame: loadMeasuredSpeed(id, ep) }) : 0;

  const prepare = useCallback(async () => {
    if (!model) return;
    const cache = await openModelCache();
    const items: DownloadItem[] = [
      ...(isOrtRuntimeLoaded() ? [] : [{ label: '解析エンジン', sizeMB: ORT_RUNTIME_MB }]),
      ...((await isModelCached(modelUrl(model), cache)) ? [] : [{ label: `解析モデル（${model.label}）`, sizeMB: model.sizeMB }]),
    ];
    setConsentItems(items);
    setStep('consent');
  }, [model]);

  const run = useCallback(async () => {
    if (!model || !ep || !mode) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('running');
    setError(null);
    try {
      const cache = await openModelCache();
      const bytes = await fetchModel(
        modelUrl(model),
        cache,
        (got, total) => setProgress({ label: 'モデルをダウンロード中', done: got, total, eta: '' }),
        fetch,
        controller.signal,
      );
      setProgress({ label: '解析の準備中', done: 0, total: 1, eta: '' });
      const { session } = await createSession(bytes, ep);
      try {
        const done: Tracked[] = [];
        for (const [i, p] of ready.entries()) {
          if (!p.video) continue;
          const r = await analyzeVideo(p.video, p.file.name, session, model.imgsz, {
            signal: controller.signal,
            onProgress: (d, t, eta) => setProgress({ label: `解析中（${i + 1}/${ready.length}本目）`, done: d, total: t, eta: formatDuration(eta) }),
          });
          saveMeasuredSpeed(mode, ep, r.msPerFrame);
          done.push(autoTrack(r));
        }
        setResults((prev) => {
          prev.forEach((t) => t.run.thumbnails.forEach((b) => b.close())); // 前回分の縮小画像を解放する
          return done;
        });
        setStep('result');
      } finally {
        await session.release();
      }
    } catch (e) {
      setError(friendlyError(e));
      setStep('setup');
    }
  }, [model, ep, mode, ready]);

  const repick = (i: number, frame: number, index: number) =>
    setResults((prev) =>
      prev.map((t, k) => (k === i ? { ...t, track: trackPitcher(t.run.frames, { frame, index }), selection: 'tap' } : t)),
    );

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-bold">投球フォーム解析</h1>
      {error && (
        <section role="alert" className="space-y-1 rounded-xl border-2 border-red-500 p-3 text-sm">
          <p className="font-bold">{error.title}</p>
          <p>{error.action}</p>
          <details>
            <summary className="min-h-11 cursor-pointer py-2">詳しい情報</summary>
            <pre className="whitespace-pre-wrap break-all text-xs">{error.detail}</pre>
          </details>
        </section>
      )}
      {step === 'start' && <StartScreen onStart={() => setStep('setup')} />}
      {step === 'setup' && (
        <>
          <EnvStatus report={report} rec={rec} />
          <VideoPicker picked={picked} onPick={onPick} />
          {manifest && rec && ready.length > 0 && (
            <ModePicker models={manifest.pose} allowed={rec.allowedModes} recommended={rec.recommendedMode}
              estimateSec={estimateSec} selected={mode} onSelect={setMode} />
          )}
          <button type="button" onClick={prepare} disabled={!model || ready.length === 0 || rec?.verdict === 'unsupported'}
            className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white disabled:opacity-40">
            次へ
          </button>
        </>
      )}
      {step === 'consent' && <DownloadConsent items={consentItems} onAccept={run} onCancel={() => setStep('setup')} />}
      {step === 'running' && <RunProgress state={progress} onCancel={() => abortRef.current?.abort()} />}
      {step === 'result' && (
        <>
          {results.map((t, i) => (
            <PitcherConfirm key={t.run.fileName} run={t.run} track={t.track} onPick={(f, idx) => repick(i, f, idx)} />
          ))}
          <ExportPanel
            items={results.map((t) => ({
              fileName: poseJsonFileName(t.run.fileName),
              onSave: () =>
                downloadJson(poseJsonFileName(t.run.fileName), toPoseJson(t.run, t.track, { modelLabel: `${model?.weights}@${model?.imgsz}`, selection: t.selection })),
            }))}
          />
        </>
      )}
    </main>
  );
}
```

`ortSession.ts` は `isOrtRuntimeLoaded` を export 済み（SPIKE にある）。`App.tsx` が 200 行を大きく超えたら、`run` と `prepare` を `src/ui/useAnalysis.ts` のフックに切り出す。

- [ ] **Step 7: App のテストを更新する** — `src/App.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./inference/capabilities', () => ({ detectCapabilities: () => new Promise(() => undefined) }));
vi.mock('./inference/manifest', async (orig) => ({
  ...(await orig<typeof import('./inference/manifest')>()),
  loadManifest: () => new Promise(() => undefined),
}));

import { App } from './App';

describe('App', () => {
  it('はじめに → 準備画面へ進む', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '投球フォーム解析' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(screen.getByText('この端末で解析できるか確認しています…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });
});
```

- [ ] **Step 8: テスト・型・ビルド**

Run: `pnpm test:coverage && pnpm build`
Expected: 全テスト PASS、カバレッジ 80% 以上、ビルド成功

- [ ] **Step 9: 手元のブラウザで一通り試す**

Run: `pnpm dev`（Task 3 Step 7 で書き出したモデルを使う）→ `http://localhost:5173/cap-pose-lab/` を Chrome で開き、手元の投球動画（検証では 4.5 秒・1920x1080・H.264・149 コマの `test_5.mp4`）で「はじめる → 動画を選ぶ → ふつう → 次へ → 解析をはじめる → 投手の枠を確認 → pose.json を保存」まで通す。
Expected: 解析が終わり、青い枠が手前の投手に付く。保存した `test_5_pose.json` を Python 版で読める:

```bash
cd <ultralytics のフォーク> && python -c "from pitching.adapters.json_adapter import load_pose_json; s=load_pose_json('$HOME/Downloads/test_5_pose.json'); print(len(s.frames), s.fps)"
```

Expected: `149 32.92...`

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "feat: スマホ向けのステップ形式の画面（環境確認・動画選択・モード選択・解析・投手確認・書き出し）" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: GitHub Pages への公開と iPhone での確認

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1〜10 のすべて
- Produces: `https://koshien2015.github.io/cap-pose-lab/` の公開サイト

- [ ] **Step 1: README に開発手順と実機確認の手順を足す**（既存の README の末尾に追記）

```markdown
## 開発

```bash
pnpm install
uv run --with-requirements tools/requirements.txt python tools/export_models.py   # モデルを public/models/ に書き出す（初回のみ）
pnpm dev        # http://localhost:5173/cap-pose-lab/
pnpm test
```

## 実機での確認（iPhone / Android）

CI では GPU を使った推論を確かめられないため、公開後に実機で次を確認する。

1. https://koshien2015.github.io/cap-pose-lab/ を Safari（Android は Chrome）で開く
2. 「はじめる」→ 環境の判定が ◎ になるか（「詳しい情報」に GPU の情報が出るか）
3. カメラで撮った縦向きの動画（HEVC・60fps）を選び、「ふつう」で解析する
4. 解析時間と、投手の枠が縦向きの映像に正しく重なるかを確認する
5. pose.json を保存し、「ファイル」アプリに保存されるかを確認する
```

- [ ] **Step 2: GitHub Pages の配信元を GitHub Actions にする**

```bash
gh api -X POST repos/koshien2015/cap-pose-lab/pages -f build_type=workflow
```

Expected: 201（既に有効なら 409。その場合は `gh api -X PUT repos/koshien2015/cap-pose-lab/pages -f build_type=workflow`）

- [ ] **Step 3: push して CI を待つ**

```bash
git add README.md
git commit -m "docs: 開発手順と実機確認の手順を README に追加" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin main
gh run watch --exit-status $(gh run list --workflow pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

Expected: build と deploy が成功する

- [ ] **Step 4: 公開サイトを確認する**

```bash
curl -sI https://koshien2015.github.io/cap-pose-lab/ | head -1
curl -sI https://koshien2015.github.io/cap-pose-lab/models/yolo26s-pose.fp32.onnx | grep -i "content-length\|HTTP/"
curl -sI https://koshien2015.github.io/cap-pose-lab/ort/ort-wasm-simd-threaded.jsep.wasm | head -1
```

Expected: いずれも 200。モデルの Content-Length が 40MB 前後

- [ ] **Step 5: Mac の Chrome で公開サイトを一通り試す**（Task 10 Step 9 と同じ手順を公開 URL で行う）

- [ ] **Step 6: iPhone での確認をユーザーに依頼する**

README の「実機での確認」の手順と、確認してほしい点（解析時間・投手の枠の向き・保存）をユーザーに伝える。結果は計画2以降の前提になるので、数字をもらって設計書 §6.1 と `estimate.ts` の基準値を更新する（別コミット）。
