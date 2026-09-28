# cap-pose-lab 計画2: 解析ロジックの移植と比較ビューア Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解析した（または保存済みの）pose.json 1〜2本について、足接地・リリースを指定し、Python 版 `pitching/` と同じ棒人間ビューア（並べて/重ねて・3種のそろえ方・速度/加速度ベクトル・数値パネル）をブラウザで見られるようにする。

**Architecture:** `pitching/` の解析のうちビューアに必要な部分（前処理 → 身体サイズ → 角度系列 → イベント → 進行率 → ビューア用データ）を `src/analysis/` に純粋関数として移植し、Python で書き出した期待値（fixture）との数値一致をテストで保証する。ビューアは `viewer_template.py` の JS を、計算部分（`src/viewer/viewerMath.ts`, 純粋関数）と描画部分（canvas）と React の画面に分けて移す。

**Tech Stack:** 計画1と同じ（Vite, React, TypeScript, Tailwind, Vitest）。fixture 生成のみ Python（`pitching/` パッケージ）。

**Spec:** `docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md`（§6 画面7・8、§6.2、§8、§8.1）。計画1（`2026-09-28-plan1-foundation-pose.md`）の成果物の上に作る。

**移植元:** `ultralytics/pitching/`（非公開の手元リポジトリ）。各タスクに移植元の関数名を書く。**移植は1対1で行い、アルゴリズムを「改善」しない**（数値一致が崩れるため）。改善したい点は ledger に書いて別計画に回す。

## Global Constraints

- 計画1の Global Constraints をすべて引き継ぐ（Author・コミット形式・pnpm・`alert` 禁止・44px・専門用語を主画面に出さない、など）
- 解析の既定値は `pitching/config.py` と同じ: `confidence_threshold=0.5`, `max_gap_frames=3`, `smoothing_window=9`, `smoothing_polyorder=2`, `normalization="shoulder_width"`, `local_minimum_order=2`, `extension_min_frames=3`, `extension_min_delta_deg=0.5`, `search_margin_frames=10`
- 欠損は NaN で表す（Python の NaN と同じ扱い）。JSON に出すときは null
- ビューア用データ（payload）の形は `pitching/visualization/viewer.py` の `build_payload` と同じキー・同じ丸め（座標・時刻・系列は小数4桁、進行率は3桁、normalized の p は2桁）
- 数値一致の許容誤差: 丸めた値どうしで `|a-b| <= 2e-4`（座標・角度）。イベントのフレームは完全一致
- 比較できるのは2本まで。リリースは手動指定のみ（ポーズだけで断定しない）。足接地も手動指定のみ
- fixture は合成データ（`pitching/examples/generate_sample_pose.py` の姿勢）から作る。実在の人物の動画から作った座標は公開リポジトリに入れない
- 今回やらないこと: 要約特徴量（`elbow_features` など）と metrics.json、言葉での結果説明、撮影ガイド、E2E（計画4）、キャップ検出（計画5）

## Review Focus

- 足接地・リリースを指定しない / 片方だけ指定: 進行率のそろえ方は選べず（リリース基準かフレーム番号）、エラーにならずに表示できる → Task 5・Task 6 にテスト
- 投手が一部のフレームで見つからない（pose.json に null のフレームがある）: 短い欠損は補間、長い欠損は線を描かない。ビューアが NaN で崩れない → Task 3・Task 5 にテスト
- 肩が一度も写らず身体サイズが決まらない: ビューアを作れない理由をやさしく出す（落ちない）→ Task 5 にテスト
- fps が違う2本（30fps と 60fps）: 各投球の速度は自分の fps で計算し、フレーム番号モードでは同じコマ数ずつ進む → Task 6 にテスト
- リリースを足接地より前に指定: 保存前に止めて理由を出す → Task 8 にテスト

---

## ファイル構成

```
cap-pose-lab/
  tools/make_fixtures.py                 Python 版を実行して fixture を書き出す（PITCHING_ROOT が必要）
  src/analysis/
    __fixtures__/*.json                  make_fixtures.py の出力（git 管理）
    fixtures.ts                          fixture の読み込みと比較ヘルパ（テスト用）
    types.ts                             Tracks・PitchConfig・PitchAnalysis などの型
    savgol.ts                            Savitzky-Golay（scipy mode='interp' と同じ）
    geometry.ts                          jointAngle / directionAngle / midpoint / distance / facingSign / gradient
    tracks.ts                            PoseJson → Tracks
    preprocess.ts                        信頼度フィルタ・短い欠損の補間・平滑化
    series.ts                            肘・前腕・膝・体幹の角度系列、肘伸展角速度、身体サイズ
    events.ts                            イベント決定・進行率
    analyzePitch.ts                      1投球分の解析
    payload.ts                           ビューア用データ（build_payload）
  src/viewer/
    viewerMath.ts                        そろえ方・コマ位置・ベクトル・範囲・表示用数値（純粋関数）
    draw.ts                              canvas への描画
    ComparisonViewer.tsx                 ビューア画面（スマホ向け）
  src/ui/
    EventMarker.tsx                      足接地・リリース・投げ腕・打者の向きの指定
    PoseFileLoader.tsx                   保存済み pose.json の読み込み
  src/flow/
    compare.ts                           結果・読み込んだ pose.json → 解析 → payload の段取り
```

---

### Task 1: Python 版から数値一致テスト用の fixture を作る

**Files:**
- Create: `tools/make_fixtures.py`, `src/analysis/__fixtures__/*.json`, `src/analysis/fixtures.ts`

**Interfaces:**
- Produces: fixture JSON（1ファイル1ケース）
  ```
  {
    "name": string,
    "config": { "pitch_id", "throwing_hand": "right"|"left", "batter_direction": "left"|"right",
                "fps", "foot_contact_frame": number|null, "release_frame": number|null },
    "input": PoseJson（SCHEMA_VERSION 1）,
    "expected": {
      "frame_indices": number[], "scale_px": number|null,
      "smoothed": { [name]: ([x, y] | null)[] },
      "series": { elbow_angle_deg, elbow_extension_velocity_deg_per_sec, forearm_angle_deg,
                  lead_knee_angle_deg, trunk_lean_deg: (number|null)[] },
      "events": { [event_name]: number|null },   // 元動画のフレーム番号
      "progress": (number|null)[],
      "payload": build_payload([analysis]) の JSON または {"error": string}
    }
  }
  ```
  と、2投球の payload（`pair.json`: `{ "inputs": [...2件], "configs": [...2件], "payload": ... }`）、savgol の単体ケース（`savgol.json`: `[{ "values", "window", "polyorder", "expected" }]`）
- `src/analysis/fixtures.ts`: `loadFixture(name: string): Fixture`, `expectClose(actual, expected, tol = 2e-4): void`（null/NaN を同一視、配列・オブジェクトを再帰比較）

- [ ] **Step 1: `tools/make_fixtures.py` を書く**

  - `PITCHING_ROOT`（`ultralytics/` のパス）を `sys.path` に足して `pitching` を import する
  - `pitching/examples/generate_sample_pose.py` の `build_series(pitch_id)` で合成の投球を作り、次のケースを書き出す
    1. `clean_right`: sample_01 そのまま（右投げ・打者は左、足接地 112・リリース 130）
    2. `noisy_gaps`: sample_02 に決定的なノイズ（`numpy.random.default_rng(7)`, 標準偏差 1.5px）を加え、右肘の信頼度を 3 フレーム 0.2 に（補間される）、左膝を 6 フレーム欠損（補間されない）、先頭 2 フレームの右手首を欠損（外挿しない）
    3. `left_mirror`: sample_01 を左右反転し（x → 1000 - x、left_/right_ を入れ替え）、左投げ・打者は右
    4. `no_events`: sample_01 で足接地・リリースとも未指定
    5. `release_only`: sample_01 でリリースだけ指定
    6. `no_shoulders`: 両肩の信頼度をすべて 0.1（身体サイズが決まらない → payload は `{"error": ...}`）
    7. `fps30`: sample_01 を1コマおきに間引いて fps=30、フレーム番号も詰める（足接地・リリースは対応するコマ）
  - 各ケースを `analyze_pitch(series, PitchConfig(...))` で解析し、`smoothed_series`・`series` の5系列・`events`・`progress_percent`・`build_payload([analysis])` を書き出す（NaN は null）。`build_payload` が `ViewerError` なら `{"error": str(e)}`
  - `pair.json`: `clean_right` と `fps30` を並べた `build_payload([a, b])`
  - `savgol.json`: `default_rng(3)` で長さ 5, 9, 12, 40 のベクトルを作り、(window, polyorder) = (9,2), (5,2), (3,1), (7,3) を `scipy.signal.savgol_filter`（mode 既定）に掛けた結果
  - 出力先 `src/analysis/__fixtures__/`。JSON は `ensure_ascii=False`, 小数は Python の既定の repr

- [ ] **Step 2: 実行して fixture を作る**

Run: `PITCHING_ROOT=<ultralytics のフォーク> <pitching の venv>/bin/python tools/make_fixtures.py`
Expected: `src/analysis/__fixtures__/` に 7 ケース + `pair.json` + `savgol.json`。`no_shoulders.json` の payload が `{"error": ...}`、`no_events.json` の payload の `normalized` が null

- [ ] **Step 3: fixture の読み込みヘルパ `src/analysis/fixtures.ts`**

  `import.meta.glob('./__fixtures__/*.json', { eager: true })` で読み込み、`loadFixture(name)` で返す。`expectClose(actual, expected, tol)` は数値なら `|a-b|<=tol`（両方 null/NaN なら一致）、配列は長さと各要素、オブジェクトはキー集合と各値を再帰的に比較し、食い違ったパスをメッセージに含めて `expect.fail` する。

- [ ] **Step 4: Commit**（`chore: 数値一致テスト用の fixture を Python 版から生成する`）

---

### Task 2: Savitzky-Golay と幾何の基礎関数

**Files:**
- Create: `src/analysis/savgol.ts`, `src/analysis/geometry.ts`
- Test: `src/analysis/savgol.test.ts`, `src/analysis/geometry.test.ts`

**Interfaces:**
- Produces:
  - `savgolFilter(values: readonly number[], window: number, polyorder: number): number[]`（scipy `savgol_filter(x, window, polyorder)` の既定 `mode='interp'` と一致）
  - `type Point = readonly [number, number]`
  - `facingSign(direction: 'left' | 'right'): 1 | -1`、`distance(a, b)`, `midpoint(a, b)`, `jointAngle(a, b, c)`, `directionAngle(origin, target, sign)`（いずれも欠損 = null を受け、結果が決まらなければ null）
  - `gradient(values: readonly number[], fps: number): number[]`（`np.gradient(values, 1/fps)`、端は片側差分、NaN は伝播、長さ2未満は全 NaN）

- [ ] **Step 1: 失敗するテストを書く**

`src/analysis/savgol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import savgolCases from './__fixtures__/savgol.json';
import { expectClose } from './fixtures';
import { savgolFilter } from './savgol';

describe('savgolFilter', () => {
  it.each(savgolCases.map((c, i) => [i, c] as const))('scipy と一致する（ケース %i）', (_i, c) => {
    expectClose(savgolFilter(c.values, c.window, c.polyorder), c.expected, 1e-9);
  });

  it('窓より短い系列は受け付けない（呼び出し側で窓を調整する前提）', () => {
    expect(() => savgolFilter([1, 2, 3], 5, 2)).toThrow();
  });
});
```

`src/analysis/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { directionAngle, distance, facingSign, gradient, jointAngle, midpoint } from './geometry';

describe('geometry', () => {
  it('jointAngle: 直線は 180°、直角は 90°、欠損やゼロ長は null', () => {
    expect(jointAngle([0, 0], [1, 0], [2, 0])).toBeCloseTo(180);
    expect(jointAngle([0, 1], [0, 0], [1, 0])).toBeCloseTo(90);
    expect(jointAngle(null, [0, 0], [1, 0])).toBeNull();
    expect(jointAngle([0, 0], [0, 0], [1, 0])).toBeNull();
  });

  it('directionAngle: 画像の Y 下向きを反転し、打者方向を正にする', () => {
    expect(directionAngle([0, 0], [0, -1], 1)).toBeCloseTo(90); // 真上
    expect(directionAngle([0, 0], [1, 0], 1)).toBeCloseTo(0); // 打者方向（右）
    expect(directionAngle([0, 0], [1, 0], -1)).toBeCloseTo(180); // 打者が左なら右向きは反対方向
  });

  it('facingSign / distance / midpoint', () => {
    expect(facingSign('right')).toBe(1);
    expect(facingSign('left')).toBe(-1);
    expect(distance([0, 0], [3, 4])).toBe(5);
    expect(midpoint([0, 0], [2, 4])).toEqual([1, 2]);
    expect(midpoint(null, [2, 4])).toBeNull();
  });

  it('gradient: np.gradient と同じ（中央差分・端は片側・NaN 伝播）', () => {
    expect(gradient([0, 1, 4, 9], 1)).toEqual([1, 2, 4, 5]);
    expect(gradient([0, 2], 2)).toEqual([4, 4]);
    const g = gradient([0, Number.NaN, 4, 9], 1);
    expect(Number.isNaN(g[0])).toBe(true);
    expect(g[3]).toBe(5);
    expect(gradient([1], 60).every(Number.isNaN)).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確認** — `pnpm vitest run src/analysis` → FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

  - `savgol.ts`: 係数は最小二乗（`scipy.signal.savgol_coeffs` と同じ: 窓の中心を 0 とした x = -h..h、Vandermonde 行列 A（x^0..x^polyorder）で `(AᵀA)⁻¹Aᵀ` の 0 行目）。中央部は係数との畳み込み。`mode='interp'` の端（先頭 h 点・末尾 h 点）は、先頭/末尾 window 点に polyorder 次多項式を最小二乗でフィットし、その多項式を各位置で評価した値。連立一次方程式はガウスの消去法（部分ピボット選択）で解く
  - `geometry.ts`: `pitching/metrics/geometry.py` の `facing_sign`, `distance`, `midpoint`, `joint_angle`（|cos|>1 を丸め、長さ < 1e-6 は null）, `direction_angle`, `derivative`（= `np.gradient`）を1対1で移す

- [ ] **Step 4: 通ることを確認** — `pnpm vitest run src/analysis` → PASS
- [ ] **Step 5: Commit**（`feat: Savitzky-Golay と幾何の基礎関数を移植`）

---

### Task 3: 姿勢データの読み込みと前処理

**Files:**
- Create: `src/analysis/types.ts`, `src/analysis/tracks.ts`, `src/analysis/preprocess.ts`
- Test: `src/analysis/preprocess.test.ts`

**Interfaces:**
- Consumes: `PoseJson`（`src/export/poseJson.ts`）, `savgolFilter`
- Produces:
  - `interface Tracks { frameIndices: number[]; timestamps: number[]; fps: number; names: string[]; xy: Record<string, [number, number][]>; confidence: Record<string, number[]> }`（欠損は `[NaN, NaN]`）
  - `tracksFromPoseJson(json: PoseJson): Tracks`（`load_pose_json` + `from_series`。frames は frame_index 昇順に並べ替え、名前は初出順）
  - `pointAt(tracks, name, position): Point | null`
  - `applyThreshold(tracks, threshold): Tracks`、`interpolateShortGaps(tracks, maxGap): Tracks`、`smoothTracks(tracks, window, polyorder): Tracks`（いずれも新しい Tracks を返す）

- [ ] **Step 1: 失敗するテストを書く** — `src/analysis/preprocess.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import { expectClose, loadFixture } from './fixtures';
import { applyThreshold, interpolateShortGaps, smoothTracks } from './preprocess';
import { pointAt, tracksFromPoseJson } from './tracks';

const run = (name: string) => {
  const f = loadFixture(name);
  const tracks = tracksFromPoseJson(f.input);
  const smoothed = smoothTracks(interpolateShortGaps(applyThreshold(tracks, 0.5), 3), 9, 2);
  return { f, tracks, smoothed };
};

describe('前処理（Python 版と一致）', () => {
  it.each(['clean_right', 'noisy_gaps', 'left_mirror', 'fps30'])('%s の平滑化後の座標', (name) => {
    const { f, smoothed } = run(name);
    expect(smoothed.frameIndices).toEqual(f.expected.frame_indices);
    for (const [kp, points] of Object.entries(f.expected.smoothed)) {
      expectClose(smoothed.xy[kp].map(([x, y]) => (Number.isNaN(x) ? null : [x, y])), points, 2e-4);
    }
  });

  it('短い欠損は補間し、長い欠損と先頭の欠損は埋めない', () => {
    const { smoothed } = run('noisy_gaps');
    const knee = smoothed.xy.left_knee.filter(([x]) => Number.isNaN(x)).length;
    expect(knee).toBeGreaterThanOrEqual(6);
    expect(pointAt(smoothed, 'right_wrist', 0)).toBeNull();
  });

  it('入力を書き換えない', () => {
    const f = loadFixture('noisy_gaps');
    const tracks = tracksFromPoseJson(f.input);
    const before = JSON.stringify(tracks.xy.right_elbow);
    applyThreshold(tracks, 0.5);
    expect(JSON.stringify(tracks.xy.right_elbow)).toBe(before);
  });
});
```

- [ ] **Step 2: 失敗を確認** → FAIL
- [ ] **Step 3: 実装する** — `pitching/preprocessing/tracks.py`（`from_series`）, `confidence_filter.py`（`apply_threshold`, `_true_runs`）, `interpolation.py`（`interpolate_short_gaps`, `_linear_fill`）, `smoothing.py`（`normalize_window`, `smooth_values`, `smooth_tracks`, `_valid_runs`）を1対1で移す。pose.json の `[null, null, conf]` は座標 NaN・信頼度 conf
- [ ] **Step 4: 通ることを確認** → PASS
- [ ] **Step 5: Commit**（`feat: 姿勢データの読み込みと前処理（信頼度・補間・平滑化）を移植`）

---

### Task 4: 角度系列・身体サイズ・イベント・進行率

**Files:**
- Create: `src/analysis/series.ts`, `src/analysis/events.ts`
- Test: `src/analysis/series.test.ts`, `src/analysis/events.test.ts`

**Interfaces:**
- Consumes: Tracks, geometry
- Produces:
  - `elbowAngleSeries(t, side)`, `forearmAngleSeries(t, side, sign)`, `leadKneeAngleSeries(t, leadSide)`, `trunkLeanSeries(t, sign)`, `extensionVelocity(angles, fps)`（いずれも `number[]`、欠損は NaN）
  - `bodyScale(t, mode: 'shoulder_width'): number | null`（有効値の中央値。numpy の median と同じく偶数個は中央2値の平均）
  - `type EventName = 'pitch_start' | 'foot_contact' | 'max_elbow_flexion' | 'extension_start' | 'release' | 'pitch_end'`
  - `interface PitchEvent { name: EventName; frame: number | null; source: 'manual' | 'pose_heuristic' }`
  - `resolveEvents(frameIndices, elbowAngles, opts: { footContactFrame: number | null; releaseFrame: number | null }): Record<EventName, PitchEvent>`
  - `progressPercent(length, contactPos: number | null, releasePos: number | null): number[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/analysis/series.test.ts`:

```ts
import { describe, it } from 'vitest';

import { expectClose, loadFixture } from './fixtures';
import { applyThreshold, interpolateShortGaps, smoothTracks } from './preprocess';
import { bodyScale, elbowAngleSeries, extensionVelocity, forearmAngleSeries, leadKneeAngleSeries, trunkLeanSeries } from './series';
import { facingSign } from './geometry';
import { tracksFromPoseJson } from './tracks';

describe('角度系列と身体サイズ（Python 版と一致）', () => {
  it.each(['clean_right', 'noisy_gaps', 'left_mirror', 'fps30', 'no_shoulders'])('%s', (name) => {
    const f = loadFixture(name);
    const t = smoothTracks(interpolateShortGaps(applyThreshold(tracksFromPoseJson(f.input), 0.5), 3), 9, 2);
    const throwing = f.config.throwing_hand;
    const lead = throwing === 'right' ? 'left' : 'right';
    const sign = facingSign(f.config.batter_direction);
    const elbow = elbowAngleSeries(t, throwing);
    const nn = (xs: number[]) => xs.map((v) => (Number.isFinite(v) ? v : null));
    expectClose(nn(elbow), f.expected.series.elbow_angle_deg);
    expectClose(nn(extensionVelocity(elbow, t.fps)), f.expected.series.elbow_extension_velocity_deg_per_sec, 1e-2);
    expectClose(nn(forearmAngleSeries(t, throwing, sign)), f.expected.series.forearm_angle_deg);
    expectClose(nn(leadKneeAngleSeries(t, lead)), f.expected.series.lead_knee_angle_deg);
    expectClose(nn(trunkLeanSeries(t, sign)), f.expected.series.trunk_lean_deg);
    expectClose(bodyScale(t, 'shoulder_width'), f.expected.scale_px);
  });
});
```

`src/analysis/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { progressPercent, resolveEvents } from './events';
import { loadFixture } from './fixtures';
import { applyThreshold, interpolateShortGaps, smoothTracks } from './preprocess';
import { elbowAngleSeries } from './series';
import { tracksFromPoseJson } from './tracks';

describe('イベントと進行率（Python 版と一致）', () => {
  it.each(['clean_right', 'noisy_gaps', 'left_mirror', 'no_events', 'release_only', 'fps30'])('%s', (name) => {
    const f = loadFixture(name);
    const t = smoothTracks(interpolateShortGaps(applyThreshold(tracksFromPoseJson(f.input), 0.5), 3), 9, 2);
    const events = resolveEvents(t.frameIndices, elbowAngleSeries(t, f.config.throwing_hand), {
      footContactFrame: f.config.foot_contact_frame,
      releaseFrame: f.config.release_frame,
    });
    for (const [key, frame] of Object.entries(f.expected.events)) {
      expect(events[key as keyof typeof events].frame, key).toBe(frame);
    }
  });

  it('進行率は足接地=0・リリース=100、区間外は NaN（外挿しない）', () => {
    const p = progressPercent(6, 1, 3);
    expect(Number.isNaN(p[0])).toBe(true);
    expect(p.slice(1, 4)).toEqual([0, 50, 100]);
    expect(Number.isNaN(p[4])).toBe(true);
    expect(progressPercent(4, null, 2).every(Number.isNaN)).toBe(true);
    expect(progressPercent(4, 2, 2).every(Number.isNaN)).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確認** → FAIL
- [ ] **Step 3: 実装する** — `metrics/elbow.py`（`elbow_angle_series`, `extension_velocity_series`）, `metrics/forearm.py`（`forearm_angle_series` = `_segment_angle_series`）, `metrics/lower_body.py`（`lead_knee_angle_series`）, `metrics/torso.py`（`trunk_lean_deg` のみ: `_lean_from_axis(direction_angle(hip_mid, shoulder_mid, sign))`）, `metrics/normalization.py`（`body_scale` の shoulder_width, scale <= 0 は null）, `events/detector.py`（`resolve_events`, `search_window`, `detect_max_flexion`, `detect_extension_start`, `_is_local_minimum`; release_source は無し）, `analysis.py`（`_progress_percent`）を1対1で移す。`forearm.py` の `_segment_angle_series` は移植元を開いて確認してから移す
- [ ] **Step 4: 通ることを確認** → PASS
- [ ] **Step 5: Commit**（`feat: 角度系列・身体サイズ・イベント・進行率を移植`）

---

### Task 5: 1投球の解析とビューア用データ（build_payload）

**Files:**
- Create: `src/analysis/analyzePitch.ts`, `src/analysis/payload.ts`
- Test: `src/analysis/payload.test.ts`

**Interfaces:**
- Consumes: Task 2〜4
- Produces:
  - `interface PitchConfig { pitchId: string; label: string; throwingHand: 'right' | 'left'; batterDirection: 'left' | 'right'; fps: number; footContactFrame: number | null; releaseFrame: number | null }`
  - `interface PitchAnalysis { config; frameIndices: number[]; timestamps: number[]; smoothed: Tracks; series: Record<PanelKey, number[]>; events: Record<EventName, PitchEvent>; progress: number[]; scalePx: number | null }`
  - `analyzePitch(json: PoseJson, config: PitchConfig): PitchAnalysis`（`analyze_pitch` のうちビューアに要る部分。区間切り出しは無し）
  - `class ViewerDataError extends Error`（やさしい文言を message に持つ）
  - `type ViewerPayload`（`build_payload` と同じ形）、`buildViewerPayload(analyses: readonly PitchAnalysis[]): ViewerPayload`
  - `PANEL_SERIES`（`viewer.py` と同じ5項目・同じ日本語ラベル）、`SKELETON_EDGES`（`visualization/skeleton.py` と同じ12辺）、`NORMALIZED_SAMPLES = 101`

- [ ] **Step 1: 失敗するテストを書く** — `src/analysis/payload.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import pair from './__fixtures__/pair.json';
import { analyzePitch, type PitchConfig } from './analyzePitch';
import { expectClose, loadFixture } from './fixtures';
import { buildViewerPayload, ViewerDataError } from './payload';

const configOf = (c: ReturnType<typeof loadFixture>['config']): PitchConfig => ({
  pitchId: c.pitch_id, label: '', throwingHand: c.throwing_hand, batterDirection: c.batter_direction,
  fps: c.fps, footContactFrame: c.foot_contact_frame, releaseFrame: c.release_frame,
});

describe('buildViewerPayload（Python 版と一致）', () => {
  it.each(['clean_right', 'noisy_gaps', 'left_mirror', 'no_events', 'release_only', 'fps30'])('%s', (name) => {
    const f = loadFixture(name);
    const payload = buildViewerPayload([analyzePitch(f.input, configOf(f.config))]);
    expectClose(payload, f.expected.payload);
  });

  it('2投球（fps が違う）の payload も一致する', () => {
    const analyses = pair.inputs.map((input, i) => analyzePitch(input, configOf(pair.configs[i])));
    expectClose(buildViewerPayload(analyses), pair.payload);
  });

  it('足接地・リリースが無ければ normalized は null（エラーにしない）', () => {
    const f = loadFixture('no_events');
    expect(buildViewerPayload([analyzePitch(f.input, configOf(f.config))]).pitches[0].normalized).toBeNull();
  });

  it('身体サイズが決まらなければ、やさしい理由付きで ViewerDataError', () => {
    const f = loadFixture('no_shoulders');
    expect(() => buildViewerPayload([analyzePitch(f.input, configOf(f.config))])).toThrow(ViewerDataError);
    try {
      buildViewerPayload([analyzePitch(f.input, configOf(f.config))]);
    } catch (e) {
      expect((e as Error).message).toContain('肩');
    }
  });

  it('3本以上は受け付けない', () => {
    const f = loadFixture('clean_right');
    const a = analyzePitch(f.input, configOf(f.config));
    expect(() => buildViewerPayload([a, a, a])).toThrow(ViewerDataError);
  });
});
```

- [ ] **Step 2: 失敗を確認** → FAIL
- [ ] **Step 3: 実装する** — `analysis.py`（`analyze_pitch` の前処理〜系列〜イベント〜進行率）と `visualization/viewer.py`（`build_payload`, `_pitch_payload`, `_reference_frame`, `_hip_center`, `_display_frame`, `_normalized_frames`（`np.interp(left=nan, right=nan)` 相当）, `_json_number`）を1対1で移す。`label`・`description` は空文字、`display_name` は pitch_id（label があれば `id (label)`）、`scale_mode` は `"shoulder_width"`。`ViewerError` の文言はやさしく言い換える: 身体サイズ → 「肩が写っているコマが無いため、比較用に大きさをそろえられません。投手の上半身が写った動画で試してください」、股関節 → 「腰が写っているコマが無いため、比較の基準点を決められません」
- [ ] **Step 4: 通ることを確認** → PASS（`pnpm test` 全体も）
- [ ] **Step 5: Commit**（`feat: 1投球の解析とビューア用データの組み立てを移植`）

---

### Task 6: ビューアの計算部分（そろえ方・コマ位置・ベクトル）

**Files:**
- Create: `src/viewer/viewerMath.ts`
- Test: `src/viewer/viewerMath.test.ts`

**Interfaces:**
- Consumes: `ViewerPayload`
- Produces（`viewer_template.py` の JS 関数を、`ui.*` のグローバル参照をやめて引数 `ViewState` で受ける形にしたもの）:
  - `type SyncMode = 'progress' | 'release' | 'frame'`、`type VectorMode = 'none' | 'velocity' | 'accel'`
  - `interface ViewState { sync: SyncMode; vector: VectorMode; target: string /* '__all__' | '__arm__' | 関節名 */ }`
  - `defaultSync(payload): SyncMode`（normalized が無い投球があれば 'release'）
  - `jointNames(payload)`, `sequence(pitch, s)`, `cursorRange(payload, s)`, `anchorIndex(pitch)`, `indexFor(pitch, cursor, s)`, `frameAt(pitch, cursor, s)`, `realIndex(pitch, cursor, s)`, `vectorAt(pitch, cursor, name, s)`, `referenceMagnitude(payload, s)`, `targetNames(pitch, s, joints)`, `bounds(payload)`, `cursorOfFrame(pitch, frame, s, samples)`, `formatNumber(v, digits?)`, `formatMagnitude(v)`, `diffText(values, format?)`

- [ ] **Step 1: 失敗するテストを書く** — `src/viewer/viewerMath.test.ts`（fixture の payload を使う）

```ts
import { describe, expect, it } from 'vitest';

import pair from '../analysis/__fixtures__/pair.json';
import { loadFixture } from '../analysis/fixtures';
import type { ViewerPayload } from '../analysis/payload';
import {
  anchorIndex, cursorOfFrame, cursorRange, defaultSync, diffText, formatMagnitude, frameAt, realIndex, vectorAt,
} from './viewerMath';

const P = pair.payload as unknown as ViewerPayload;
const noEvents = loadFixture('no_events').expected.payload as unknown as ViewerPayload;

describe('viewerMath', () => {
  it('進行率でそろえられない投球があれば、既定はリリース基準', () => {
    expect(defaultSync(P)).toBe('progress');
    expect(defaultSync(noEvents)).toBe('release');
  });

  it('進行率モードのカーソルは 0〜100', () => {
    expect(cursorRange(P, { sync: 'progress', vector: 'none', target: '__arm__' })).toEqual({ min: 0, max: 100 });
  });

  it('リリース基準ではリリースが 0、前後は長いほうに合わせる', () => {
    const s = { sync: 'release', vector: 'none', target: '__arm__' } as const;
    const r = cursorRange(P, s);
    expect(r.min).toBe(-Math.max(...P.pitches.map(anchorIndex)));
    const a = P.pitches[0];
    expect(frameAt(a, 0, s)?.f).toBe(a.events.release.frame);
  });

  it('リリースが無い投球はリリース基準で先頭を 0 とする（落ちない）', () => {
    expect(anchorIndex(noEvents.pitches[0])).toBe(0);
  });

  it('速度は各投球の fps で秒あたりに直す（fps が違っても同じ動きなら同じ値）', () => {
    const s = { sync: 'frame', vector: 'velocity', target: '__arm__' } as const;
    const [a, b] = P.pitches; // b は a を1コマおきに間引いた 30fps
    const va = vectorAt(a, 20, 'right_wrist', s);
    const vb = vectorAt(b, 10, 'right_wrist', s);
    expect(va && vb).toBeTruthy();
    expect(Math.hypot(...vb!)).toBeCloseTo(Math.hypot(...va!), 0);
  });

  it('加速度は前後が揃わないコマでは null', () => {
    const s = { sync: 'frame', vector: 'accel', target: '__arm__' } as const;
    expect(vectorAt(P.pitches[0], 0, 'right_wrist', s)).toBeNull();
  });

  it('進行率モードの数値は、進行率が最も近い実フレームの値', () => {
    const s = { sync: 'progress', vector: 'none', target: '__arm__' } as const;
    const a = P.pitches[0];
    const i = realIndex(a, 50, s)!;
    expect(Math.abs(a.frames[i].p! - 50)).toBeLessThan(5);
  });

  it('イベントの目盛り位置（進行率モードはリリースが右端）', () => {
    const a = P.pitches[0];
    expect(cursorOfFrame(a, a.events.release.frame!, { sync: 'progress', vector: 'none', target: '__arm__' }, 101)).toBe(100);
  });

  it('表示用の数値', () => {
    expect(formatMagnitude(0.012345)).toBe('0.0123');
    expect(formatMagnitude(null)).toBe('—');
    expect(diffText([10, 7.5])).toBe('+2.5');
    expect(diffText([1, null])).toBe('');
  });
});
```

- [ ] **Step 2: 失敗を確認** → FAIL
- [ ] **Step 3: 実装する** — `viewer_template.py` の同名関数（`sequence`〜`targetNames`, `bounds`, `cursorOfFrame`, `formatNumber`, `formatMagnitude`, `diffText`）を1対1で移す。`referenceMagnitude` のキャッシュはやめ、呼び出し側（React の `useMemo`）で持つ
- [ ] **Step 4: 通ることを確認** → PASS
- [ ] **Step 5: Commit**（`feat: ビューアの計算部分（そろえ方・コマ位置・ベクトル）を移植`）

---

### Task 7: ビューアの描画と画面（スマホ向け）

**Files:**
- Create: `src/viewer/draw.ts`, `src/viewer/ComparisonViewer.tsx`
- Test: `src/viewer/ComparisonViewer.test.tsx`

**Interfaces:**
- Consumes: `ViewerPayload`, viewerMath
- Produces: `<ComparisonViewer payload={ViewerPayload} />`

- [ ] **Step 1: 失敗するテストを書く** — `src/viewer/ComparisonViewer.test.tsx`（canvas の描画内容はテストしない。操作と数値パネルを見る）

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import pair from '../analysis/__fixtures__/pair.json';
import type { ViewerPayload } from '../analysis/payload';
import { ComparisonViewer } from './ComparisonViewer';

const payload = pair.payload as unknown as ViewerPayload;

describe('ComparisonViewer', () => {
  it('2投球の名前と数値パネルを出し、コマ送りでフレームが進む', async () => {
    render(<ComparisonViewer payload={payload} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('肘角度')).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'コマ' });
    const before = Number((slider as HTMLInputElement).value);
    await userEvent.click(screen.getByRole('button', { name: '次のコマ' }));
    expect(Number((slider as HTMLInputElement).value)).toBe(before + 1);
  });

  it('そろえ方を切り替えられ、進行率が使えない投球があれば選べない', async () => {
    render(<ComparisonViewer payload={payload} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'そろえ方' }), 'release');
    expect((screen.getByRole('combobox', { name: 'そろえ方' }) as HTMLSelectElement).value).toBe('release');
  });

  it('読み方の説明を折りたたみで出す（矢印は力そのものではない）', () => {
    render(<ComparisonViewer payload={payload} />);
    expect(screen.getByText('読み方')).toBeInTheDocument();
    expect(screen.getByText(/力そのものではありません/)).toBeInTheDocument();
  });
});
```

`src/test/setup.ts` に、jsdom に無い `HTMLCanvasElement.prototype.getContext` の最小スタブ（何もしない 2D コンテキスト）を足す。

- [ ] **Step 2: 失敗を確認** → FAIL
- [ ] **Step 3: 実装する**
  - `draw.ts`: `projector`, `drawStickFigure`, `drawTrail`, `drawArrow`, `drawVectors`, `drawScene(canvas, payload, pitchIndexes, cursor, state, arrowScale, trail, reference)` を `viewer_template.py` から移す（色・線幅・`MAX_ARROW_LENGTH=1.2`・`MAX_CANVAS_HEIGHT=520`・床線も同じ）
  - `ComparisonViewer.tsx`:
    - 設定（そろえ方・表示・ベクトル・対象・矢印倍率・軌跡）は `<select>` / `<input>`（ラベル付き、44px 以上）。進行率が使えない投球があれば「進行率」の選択肢を disabled にし、理由（「足接地とリリースを指定すると選べます」）を出す
    - 画面下に固定の操作バー: 「前のコマ」「再生/停止」「次のコマ」（aria-label 付き）と、コマのスライダー（aria-label「コマ」）、その下にイベントの目盛り
    - キャンバス: 「並べて」は縦持ちで上下、横持ち（`min-width: 640px` かつ横長）で左右。「重ねて」は1枚
    - 数値パネル（表）: 項目・A・B・差。2本目が無ければ B 列は「—」
    - 「読み方」は `<details>`。文言は viewer_template の note を、です・ます調でやさしく（「矢印は力そのものではありません」「2D の映像から見た動きなので、奥行き方向は含みません」「2球の差は観測された違いで、原因を示すものではありません」）
    - キーボード: ←/→ でコマ送り、スペースで再生（PC 用）
    - 再生は `setInterval`、間隔は `max(20, 1000 / (fps * 速度))`。アンマウント時に止める
- [ ] **Step 4: 通ることを確認** → PASS。`pnpm dev` で fixture の pair を表示する一時ページは作らない（Task 9 で実データで確認する）
- [ ] **Step 5: Commit**（`feat: 比較ビューアの描画と画面を追加（スマホ向け）`）

---

### Task 8: 足接地・リリースの指定画面と、保存済み pose.json の読み込み

**Files:**
- Create: `src/ui/EventMarker.tsx`, `src/ui/PoseFileLoader.tsx`, `src/flow/compare.ts`
- Test: `src/flow/compare.test.ts`, `src/ui/EventMarker.test.tsx`

**Interfaces:**
- Consumes: `PoseJson`, `analyzePitch`, `buildViewerPayload`, `PoseRun`（計画1）
- Produces:
  - `interface CompareInput { json: PoseJson; thumbnails: readonly ImageBitmap[] | null; thumbStride: number; config: PitchConfig }`
  - `validateEvents(contact: number | null, release: number | null): string | null`（問題があれば理由の文言）
  - `parsePoseFile(text: string): PoseJson`（zod で SCHEMA_VERSION 1 を検証。不正ならやさしい文言の Error）
  - `buildComparison(inputs: readonly CompareInput[]): { payload: ViewerPayload } | { error: string }`
  - `<EventMarker input={CompareInput} onChange={(config) => void} />`、`<PoseFileLoader onLoad={(files: { name: string; json: PoseJson }[]) => void} />`

- [ ] **Step 1: 失敗するテストを書く**

`src/flow/compare.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { loadFixture } from '../analysis/fixtures';
import { buildComparison, parsePoseFile, validateEvents } from './compare';

const input = (name: string, over: Partial<{ footContactFrame: number | null; releaseFrame: number | null }> = {}) => {
  const f = loadFixture(name);
  return {
    json: f.input, thumbnails: null, thumbStride: 1,
    config: {
      pitchId: f.config.pitch_id, label: '', throwingHand: f.config.throwing_hand, batterDirection: f.config.batter_direction,
      fps: f.config.fps, footContactFrame: f.config.foot_contact_frame, releaseFrame: f.config.release_frame, ...over,
    },
  };
};

describe('validateEvents', () => {
  it('リリースが足接地より前なら止める', () => {
    expect(validateEvents(130, 112)).toContain('リリース');
  });
  it('どちらか未指定・正しい順番なら通す', () => {
    expect(validateEvents(null, 130)).toBeNull();
    expect(validateEvents(112, 130)).toBeNull();
  });
});

describe('parsePoseFile', () => {
  it('保存した pose.json を読める', () => {
    const f = loadFixture('clean_right');
    expect(parsePoseFile(JSON.stringify(f.input)).frames.length).toBe(f.input.frames.length);
  });
  it('形式が違うファイルは、やさしい文言で断る', () => {
    expect(() => parsePoseFile('{"hello":1}')).toThrow('解析結果のファイルではありません');
    expect(() => parsePoseFile('not json')).toThrow('解析結果のファイルではありません');
  });
});

describe('buildComparison', () => {
  it('2本からビューア用データを作る', () => {
    const r = buildComparison([input('clean_right'), input('fps30')]);
    expect('payload' in r && r.payload.pitches.length).toBe(2);
  });
  it('イベント未指定でも作れる（進行率は使えない）', () => {
    const r = buildComparison([input('clean_right', { footContactFrame: null, releaseFrame: null })]);
    expect('payload' in r && r.payload.pitches[0].normalized).toBeNull();
  });
  it('作れないときはやさしい理由を返す（例外にしない）', () => {
    const r = buildComparison([input('no_shoulders')]);
    expect('error' in r && r.error).toContain('肩');
  });
});
```

`src/ui/EventMarker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { loadFixture } from '../analysis/fixtures';
import { EventMarker } from './EventMarker';

describe('EventMarker', () => {
  it('表示中のコマを足接地・リリースに指定でき、順番が逆なら理由を出す', async () => {
    const f = loadFixture('no_events');
    const onChange = vi.fn();
    const config = {
      pitchId: 'a', label: '', throwingHand: 'right' as const, batterDirection: 'left' as const,
      fps: 60, footContactFrame: null, releaseFrame: null,
    };
    render(<EventMarker input={{ json: f.input, thumbnails: null, thumbStride: 1, config }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'このコマをリリースにする' }));
    const releaseFrame = onChange.mock.calls.at(-1)?.[0].releaseFrame;
    expect(releaseFrame).toBe(f.input.frames[0].frame_index);
    await userEvent.click(screen.getByRole('button', { name: '次のコマ' }));
    await userEvent.click(screen.getByRole('button', { name: 'このコマを足接地にする' }));
    expect(screen.getByText(/リリースは足接地より後/)).toBeInTheDocument();
  });

  it('投げ腕と打者の向きを切り替えられる', async () => {
    const f = loadFixture('no_events');
    const onChange = vi.fn();
    const config = {
      pitchId: 'a', label: '', throwingHand: 'right' as const, batterDirection: 'left' as const,
      fps: 60, footContactFrame: null, releaseFrame: null,
    };
    render(<EventMarker input={{ json: f.input, thumbnails: null, thumbStride: 1, config }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '左投げ' }));
    expect(onChange.mock.calls.at(-1)?.[0].throwingHand).toBe('left');
  });
});
```

- [ ] **Step 2: 失敗を確認** → FAIL
- [ ] **Step 3: 実装する**
  - `compare.ts`: `validateEvents`（release <= contact なら「リリースは足接地より後のコマにしてください」）、`parsePoseFile`（`JSON.parse` と zod: `schema_version === 1`, `meta.fps > 0`, `frames[].frame_index/timestamp_sec/keypoints`。失敗は「解析結果のファイルではありません（このサイトで保存した _pose.json を選んでください）」）、`buildComparison`（`analyzePitch` → `buildViewerPayload`、`ViewerDataError` は `{ error }` に）
  - `EventMarker.tsx`: コマのスライダー（step は thumbStride）と「前のコマ」「次のコマ」、縮小画像があれば描いてその上に投手の骨格を重ね、無ければ骨格だけを描く。「このコマを足接地にする」「このコマをリリースにする」ボタン、指定済みのコマ番号の表示と「取り消す」。投げ腕（右投げ/左投げ）と打者の向き（打者は画面の左/右）のラジオ。`validateEvents` の結果を表示し、問題があるときは onChange に渡さない
  - `PoseFileLoader.tsx`: `<input type="file" accept=".json,application/json" multiple>`（最大2つ）→ `parsePoseFile`、失敗はファイルごとに文言を出す
- [ ] **Step 4: 通ることを確認** → PASS
- [ ] **Step 5: Commit**（`feat: 足接地・リリースの指定画面と、保存済み pose.json の読み込みを追加`）

---

### Task 9: 画面の流れに組み込む

**Files:**
- Modify: `src/App.tsx`, `src/ui/StartScreen.tsx`, `src/ui/ExportPanel.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: 失敗するテストを書く** — `src/App.test.tsx` に追加

```tsx
  it('はじめに画面から、保存した解析結果を読み込んで比べる入口がある', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: '保存した解析結果で比べる' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: 失敗を確認** → FAIL
- [ ] **Step 3: 実装する**
  - ステップを `start | setup | consent | running | result | mark | viewer | load` に広げる
  - 結果画面（投手の確認）の下に「フォームを比べる（足接地とリリースを指定）」ボタン → `mark`
  - はじめに画面に「保存した解析結果で比べる」ボタン → `load`（PoseFileLoader）→ 読み込めたら `mark`
  - `mark`: 動画ごとに EventMarker を縦に並べ、「比べる」ボタンで `buildComparison` → `viewer`。エラーなら画面内パネルに文言
  - `viewer`: ComparisonViewer と「指定をやり直す」「最初に戻る」
  - pose.json の保存は結果画面・指定画面の両方から（ExportPanel の文言「比較画面は準備中」を消す）
  - 解析結果（PoseRun + 追跡）から CompareInput を作るときは `toPoseJson` の出力を使う（pose.json と同じ経路にし、読み込みと実行時で結果がずれないようにする）
- [ ] **Step 4: テスト・型・lint・ビルド** — `pnpm test:coverage && pnpm lint && pnpm build` → PASS
- [ ] **Step 5: 手元で一通り試す** — `pnpm dev`、手元の投球動画で「解析 → 投手確認 → フォームを比べる → 足接地・リリース指定 → ビューア（並べて/重ねて・3種のそろえ方・加速度ベクトル・再生）」、保存した pose.json 2本を読み込んで同じ流れ
- [ ] **Step 6: Commit**（`feat: 解析結果・保存した結果から比較ビューアへ進む流れを追加`）

---

### Task 10: 全体レビュー・公開

- [ ] **Step 1:** 全体レビュー（別コンテキストのレビュアー）→ Critical/Important を TDD で修正
- [ ] **Step 2:** 公開前に docs と履歴に私的な参照が無いか確認（`/Users/`, 非公開リポジトリ名）
- [ ] **Step 3:** `main` に反映して push、CI（pages）成功を確認
- [ ] **Step 4:** 公開サイトで Task 9 Step 5 と同じ流れを確認
