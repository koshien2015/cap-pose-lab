# 打者モード（計画6）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 捕手の後方から撮った打者のスイングを、投手と同じ比較画面で2本比べられるようにする（インパクト基準・2本目のずらし・任意の進行率・打者のまとめの値）。

**Architecture:** 打者の解析は `src/batting/` に新しく作り、投手の解析（`src/analysis/analyzePitch.ts` ほか）は変えない。前処理・キーポイントの読み込み・追跡は共通で使う。比較画面（`src/viewer/`）は共通のままにし、投手に固有の文言と関節を、比較用データ（`ViewerPayload`）の**省略できる**項目で上書きできるようにする。投手の比較用データは項目を増やさない。

**Tech Stack:** React 19 + TypeScript（strict）+ Vite、Vitest + Testing Library、zod 4、Tailwind CSS。パッケージ管理は pnpm。

**Spec:** `docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md` の §14（打者モード）。§6（画面の流れ）・§8（解析の移植）も前提。

## Global Constraints

- 投手の比較用データ（`buildViewerPayload` の出力）には**キーを1つも足さない**。`src/analysis/fixtures.ts` の `expectClose` はキーの和集合まで照合するため、足すと Python 版との一致テストが落ちる
- 新しい項目は `ViewerPayload`・`ViewerPitch` の**省略できる**項目にし、打者の比較用データだけが書く。省略時、比較画面は今の投手の表示にする
- 揃え方の内部の値は `'release'` のまま（「基準の瞬間に合わせる」の意味）。表示名だけ比較用データから作る
- 既存テストで確かめている投手の文言は一字一句変えない: 「はじめる」「保存した解析結果で比べる」「このコマをリリースにする」「このコマを足接地にする」「リリースは足接地より後」「進行率（足接地→リリース）」「リリースに合わせる」「投げる腕」「腕の通り道を表示する」「「進行率」は、足接地とリリースを指定すると選べます。」「力そのものではありません」「フォームを比べる（足接地とリリースを指定）」
- 既存のテストファイルは書き換えない（テストを**足す**のはよい）。各タスクの終わりに全テストが通ること
- 画面に内部名を出さない（関節名は `jointLabel`、`hands` は「両手」）
- 値が出せないときは作った値で埋めず、欠損（`NaN`／`null`／「—」）にする
- ミュータブルな書き換えをしない（新しいオブジェクトを作る）。`console.log` を残さない
- タップ領域は 44px 以上（`min-h-11`）。`alert`／`confirm` は使わない
- コミットの Author は `ckoshien <ckoshien@gmail.com>`（リポジトリの設定済み）。コミットメッセージは日本語の Conventional Commits で、末尾に `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` を付ける
- 各タスクの確認: `pnpm vitest run <そのタスクのテスト>` と `pnpm exec tsc -b`（型の確認。vitest は型を見ない）。最後のタスクで `pnpm test && pnpm lint && pnpm build`

## Review Focus

1. 右打者と左打者を並べて比べると、左右の反転後に同じ向き・同じ値で並ぶこと（同じ動きなら系列が一致する）→ Task 5・Task 7 のテスト
2. 片方の手首が欠けたコマでは `hands` の点を作らない（半端な位置を出さない）→ Task 5 のテスト
3. 2本目を範囲の端（±長いほうのコマ数）までずらしても落ちず、目盛りも一緒にずれ、端より先へはずらせない → Task 1・Task 2 のテスト
4. インパクトが先頭のコマ、トップとインパクトが同じコマのとき、`NaN` ではなく値か理由を出す（同じコマは指定画面で止める）→ Task 4・Task 6 のテスト
5. `meta.subject` の無い古い pose.json は、投手・打者どちらでも読める → Task 8 のテスト

---

## File Structure

| ファイル | 役割 | 作成/変更 |
|---|---|---|
| `src/analysis/types.ts` | `Subject` 型、`PoseJsonInput.meta.subject?` | 変更 |
| `src/analysis/payload.ts` | 比較用データの型を広げる（省略できる項目・`SummaryItem`）、`normalizedFrames`・`round`・`jsonNumber` を公開 | 変更（投手の出力は不変） |
| `src/viewer/viewerMath.ts` | 基準の瞬間の名前・2本目のずらし・`arm_joints`・「両手」 | 変更 |
| `src/viewer/presentation.ts` | 比較画面の文言（データに書かれていればそれ、無ければ投手の文言） | 作成 |
| `src/viewer/ShiftControl.tsx` | 「2本目をずらす」の操作 | 作成 |
| `src/viewer/SummaryTable.tsx` | まとめの表 | 作成 |
| `src/viewer/ViewerSettings.tsx`・`draw.ts`・`ReadoutTable.tsx`・`ComparisonViewer.tsx` | 文言・ずらし・軌跡の関節を反映 | 変更 |
| `src/batting/analyzeSwing.ts` | スイング1本の解析（前処理・瞬間・進行率・胴の長さ） | 作成 |
| `src/batting/syntheticSwing.ts` | テスト用の合成スイング（テストからだけ使う） | 作成 |
| `src/batting/swingFrames.ts` | 比較画面の座標への変換（原点・胴の長さ・左打者の反転・`hands`） | 作成 |
| `src/batting/swingSeries.ts` | グラフ6項目 | 作成 |
| `src/batting/swingSummary.ts` | まとめ3項目 | 作成 |
| `src/batting/swingPayload.ts` | 打者の比較用データ | 作成 |
| `src/flow/swingCompare.ts` | 打者の比較の段取り | 作成 |
| `src/export/poseJson.ts`・`src/flow/compare.ts` | `meta.subject` の書き込みと照合 | 変更 |
| `src/ui/Choice.tsx`・`FrameScrubber.tsx`・`CompareShell.tsx` | 指定画面の共通部品（`EventMarker`・`CompareFlow` から切り出す） | 作成 |
| `src/ui/EventMarker.tsx`・`CompareFlow.tsx` | 共通部品を使うよう書き換え（見た目・文言は不変） | 変更 |
| `src/ui/SwingMarker.tsx`・`SwingCompareFlow.tsx` | 打者の指定画面と段取り | 作成 |
| `src/ui/StartScreen.tsx`・`PitcherConfirm.tsx`・`PoseFileLoader.tsx`・`src/App.tsx` | 打者モードへの入口と切り替え | 変更 |
| `README.md`・設計書 | 打者モードの説明・状態 | 変更 |

---

### Task 1: 比較用データの型と viewerMath を打者に対応させる

**Files:**
- Modify: `src/analysis/types.ts`
- Modify: `src/analysis/payload.ts`
- Modify: `src/viewer/viewerMath.ts`
- Test: `src/viewer/viewerMath.test.ts`（追記）、`src/analysis/payload.test.ts`（追記）

**Interfaces:**
- Produces:
  - `type Subject = 'pitcher' | 'batter'`（`src/analysis/types.ts`）
  - `interface SummaryItem { key: string; label: string; unit: string; digits: number; signed: boolean; value: number | null; text: string | null; reason: string | null }`（`src/analysis/payload.ts`）
  - `ViewerPitch` の追加項目 `arm_joints?: readonly string[]`・`trail_joints?: readonly string[]`・`summary?: readonly SummaryItem[]`、`events` と `series` のキーは `string`
  - `ViewerPayload` の追加項目 `subject?`・`anchor_event?`・`anchor_label?`・`progress_label?`・`progress_hint?`・`event_labels?`・`arm_label?`・`trail_label?`・`reading_notes?`、`panel_series` のキーは `string`
  - `export function normalizedFrames(frames: readonly ViewerFrame[]): ViewerPitch['normalized']`・`export const round`・`export const jsonNumber`（`payload.ts`）
  - `ViewState.anchorEvent?: string`・`ViewState.shift?: number`
  - `anchorIndex(pitch: ViewerPitch, event = 'release'): number`
  - `pitchCursor(cursor: number, pitchIndex: number, s: ViewState): number`
  - `cursorOfFrame(pitch, frame, s, samples, pitchIndex = 0): number | null`
  - `shiftLimit(payload: ViewerPayload): number`

- [ ] **Step 1: 失敗するテストを書く**

`src/viewer/viewerMath.test.ts` の末尾に足す（既存の import 行に `pitchCursor, shiftLimit, targetNames` を加える）:

```ts
describe('2本目のずらし', () => {
  const s = (shift: number, sync: ViewState['sync'] = 'frame') => state({ sync, shift });

  it('+n なら、同じ位置で2本目は n コマ前のコマを出す（1本目は動かない）', () => {
    expect(pitchCursor(10, 0, s(3))).toBe(10);
    expect(pitchCursor(10, 1, s(3))).toBe(7);
  });

  it('進行率ではずらさない', () => {
    expect(pitchCursor(10, 1, s(3, 'progress'))).toBe(10);
  });

  it('範囲は、ずらした2本目も入るよう広がる', () => {
    const [a, b] = P.pitches;
    expect(cursorRange(P, s(0))).toEqual({ min: 0, max: Math.max(a.frames.length, b.frames.length) - 1 });
    expect(cursorRange(P, s(30)).max).toBe(Math.max(a.frames.length - 1, b.frames.length - 1 + 30));
    expect(cursorRange(P, s(-5)).min).toBe(-5);
  });

  it('基準の瞬間に合わせるときも、2本目の範囲だけずれる', () => {
    const base = cursorRange(P, s(0, 'release'));
    const [a, b] = P.pitches;
    const shifted = cursorRange(P, s(4, 'release'));
    expect(shifted.min).toBe(Math.min(-anchorIndex(a), -anchorIndex(b) + 4));
    expect(shifted.max).toBe(Math.max(base.max, b.frames.length - 1 - anchorIndex(b) + 4));
  });

  it('目盛りも2本目だけずれる', () => {
    const [a, b] = P.pitches;
    const at = cursorOfFrame(b, b.events.release.frame!, s(0, 'release'), 101, 1)!;
    expect(cursorOfFrame(b, b.events.release.frame!, s(4, 'release'), 101, 1)).toBe(at + 4);
    expect(cursorOfFrame(a, a.events.release.frame!, s(4, 'release'), 101, 0)).toBe(0);
  });

  it('端までずらしても、範囲の端で落ちない', () => {
    const limit = shiftLimit(P);
    expect(limit).toBe(Math.max(...P.pitches.map((p) => p.frames.length)));
    for (const shift of [limit, -limit]) {
      const st = s(shift, 'release');
      const r = cursorRange(P, st);
      for (const c of [r.min, r.max]) {
        P.pitches.forEach((p, i) => expect(() => frameAt(p, pitchCursor(c, i, st), st)).not.toThrow());
      }
    }
  });
});

describe('比較用データでの上書き（打者）', () => {
  it('anchorEvent の瞬間を 0 にする', () => {
    const a = P.pitches[0];
    const withImpact = { ...a, events: { ...a.events, impact: { frame: a.frames[5].f, source: 'manual' } } };
    expect(anchorIndex(withImpact, 'impact')).toBe(5);
    expect(frameAt(withImpact, 0, state({ sync: 'release', anchorEvent: 'impact' }))?.f).toBe(a.frames[5].f);
  });

  it('arm_joints があれば「投げる腕」はその関節、無ければ投球腕', () => {
    const a = P.pitches[0];
    expect(targetNames({ ...a, arm_joints: ['hands'] }, state({ target: '__arm__' }), [])).toEqual(['hands']);
    const side = a.throwing_side;
    expect(targetNames(a, state({ target: '__arm__' }), [])).toEqual([`${side}_shoulder`, `${side}_elbow`, `${side}_wrist`]);
  });

  it('両手は日本語名で出す', () => {
    expect(jointLabel('hands')).toBe('両手');
  });
});
```

`src/analysis/payload.test.ts` の `describe('buildViewerPayload（Python 版と一致）'` の中に足す:

```ts
  it('投手の比較用データには打者用の項目を書かない（Python 版との照合がキーまで見るため）', () => {
    const f = loadFixture('clean_right');
    const payload = buildViewerPayload([analyzePitch(f.input, configOf(f.config))]);
    ['subject', 'anchor_event', 'anchor_label', 'progress_label', 'progress_hint', 'event_labels', 'arm_label', 'trail_label', 'reading_notes'].forEach(
      (key) => expect(payload).not.toHaveProperty(key),
    );
    ['arm_joints', 'trail_joints', 'summary'].forEach((key) => expect(payload.pitches[0]).not.toHaveProperty(key));
  });
```

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm vitest run src/viewer/viewerMath.test.ts src/analysis/payload.test.ts`
Expected: FAIL（`pitchCursor`・`shiftLimit` が export されていない。payload の新しいテストは通ってよい）

- [ ] **Step 3: 型を広げる**

`src/analysis/types.ts` に足す:

```ts
/** 解析の対象（投手のフォーム比較 / 打者のスイング比較） */
export type Subject = 'pitcher' | 'batter';
```

同じファイルの `PoseJsonInput.meta` を次にする:

```ts
  readonly meta: { readonly fps: number; readonly pitch_id: string; readonly subject?: Subject };
```

`src/analysis/payload.ts`:

1. import に `import type { Subject } from './types';` を足し、`import type { EventName } from './events';` は使わなくなるので消す。
2. `const round = ...` と `const jsonNumber = ...` を `export const` にする。
3. `function normalizedFrames(` を `export function normalizedFrames(` にする。
4. `ViewerPitch` と `ViewerPayload` を次に置き換え、その上に `SummaryItem` を足す:

```ts
/** 1本分のまとめの値（打者のみ）。出せないときは value を null にし、reason に理由を書く */
export interface SummaryItem {
  readonly key: string;
  readonly label: string;
  /** 値のうしろに付ける単位（例: ' ms'。無ければ ''） */
  readonly unit: string;
  readonly digits: number;
  /** 正の値に + を付けるか */
  readonly signed: boolean;
  readonly value: number | null;
  /** 値に添える言葉（例: 「腰が先」）。無ければ null */
  readonly text: string | null;
  /** 出せない理由。値があれば null */
  readonly reason: string | null;
}

export interface ViewerPitch {
  readonly pitch_id: string;
  readonly label: string;
  readonly display_name: string;
  readonly description: string;
  readonly fps: number;
  readonly throwing_hand: 'right' | 'left';
  readonly throwing_side: 'right' | 'left';
  readonly lead_side: 'right' | 'left';
  readonly batter_direction: 'left' | 'right';
  readonly scale_px: number;
  readonly scale_mode: string;
  readonly events: Readonly<Record<string, { frame: number | null; source: string }>>;
  readonly frames: readonly ViewerFrame[];
  readonly normalized: readonly { p: number; k: Readonly<Record<string, XY>> }[] | null;
  readonly series: Readonly<Record<string, readonly (number | null)[]>>;
  // 以下は打者の比較用データだけが書く（省略時は投手の表示）
  /** 「投げる腕」の選択肢が指す関節（省略時は投球腕の肩・肘・手首） */
  readonly arm_joints?: readonly string[];
  /** 軌跡を描く関節（省略時は投球腕の手首・肘） */
  readonly trail_joints?: readonly string[];
  readonly summary?: readonly SummaryItem[];
}

export interface ViewerPayload {
  readonly edges: readonly (readonly [string, string])[];
  readonly panel_series: Readonly<Record<string, string>>;
  readonly normalized_samples: number;
  readonly pitches: readonly ViewerPitch[];
  // 以下は打者の比較用データだけが書く。投手では書かない（Python 版との照合がキーまで見るため）
  readonly subject?: Subject;
  /** 「基準の瞬間に合わせる」の瞬間（省略時は release） */
  readonly anchor_event?: string;
  readonly anchor_label?: string;
  readonly progress_label?: string;
  readonly progress_hint?: string;
  /** 目盛りに出す瞬間とその表示名 */
  readonly event_labels?: Readonly<Record<string, string>>;
  readonly arm_label?: string;
  readonly trail_label?: string;
  /** 「読み方」の座標と限界の段落（矢印の段落は共通で出す） */
  readonly reading_notes?: readonly string[];
}
```

5. `pitchPayload` の `events` の型注釈 `as ViewerPitch['events']` はそのままでよい。

- [ ] **Step 4: viewerMath を書き換える**

`src/viewer/viewerMath.ts`:

`ViewState` を次にする:

```ts
export interface ViewState {
  readonly sync: SyncMode;
  readonly vector: VectorMode;
  /** '__all__'（全関節）/ '__arm__'（投球腕。打者は両手）/ 関節名 */
  readonly target: string;
  /** 'release'（基準の瞬間に合わせる）で使う瞬間の名前（省略時は release） */
  readonly anchorEvent?: string;
  /** 2本目をずらすコマ数（+n で2本目が n コマ後ろにずれる。進行率では効かない） */
  readonly shift?: number;
}
```

`JOINT_LABELS` の最後に `hands: '両手',` を足す。

`anchorIndex` から `cursorRange` までを次に置き換える:

```ts
export function anchorIndex(pitch: ViewerPitch, event = 'release'): number {
  const frame = pitch.events[event]?.frame;
  if (frame === null || frame === undefined) return 0;
  const index = pitch.frames.findIndex((f) => f.f === frame);
  return index < 0 ? 0 : index;
}

/** その投球をずらすコマ数（1本目と進行率ではずらさない） */
const shiftOf = (pitchIndex: number, s: ViewState) => (s.sync === 'progress' || pitchIndex === 0 ? 0 : (s.shift ?? 0));

/** 画面のカーソル位置を、その投球の中の位置にする（2本目はずらした分だけ戻す） */
export function pitchCursor(cursor: number, pitchIndex: number, s: ViewState): number {
  return cursor - shiftOf(pitchIndex, s);
}

/** ずらせる幅（± 長いほうの動画のコマ数） */
export function shiftLimit(payload: ViewerPayload): number {
  return Math.max(...payload.pitches.map((p) => p.frames.length));
}

export function cursorRange(payload: ViewerPayload, s: ViewState): { min: number; max: number } {
  if (s.sync === 'progress') return { min: 0, max: payload.normalized_samples - 1 };
  const spans = payload.pitches.map((p, i) => {
    const start = (s.sync === 'release' ? -anchorIndex(p, s.anchorEvent) : 0) + shiftOf(i, s);
    return { min: start, max: start + p.frames.length - 1 };
  });
  return { min: Math.min(...spans.map((r) => r.min)), max: Math.max(...spans.map((r) => r.max)) };
}
```

`indexFor` の `release` の行を次にする:

```ts
  if (s.sync === 'release') return anchorIndex(pitch, s.anchorEvent) + cursor;
```

`referenceMagnitude` の先頭で、ずらしを外した状態を使う（ずらしで矢印の基準が変わらないように）:

```ts
export function referenceMagnitude(payload: ViewerPayload, state: ViewState): number {
  const s: ViewState = { ...state, shift: 0 };
  const joints = jointNames(payload);
  // 以下は今のまま（s を使う）
```

`targetNames` の `__arm__` の分岐を次にする:

```ts
  if (s.target === '__arm__') {
    if (pitch.arm_joints) return pitch.arm_joints;
    const side = pitch.throwing_side;
    return [`${side}_shoulder`, `${side}_elbow`, `${side}_wrist`];
  }
```

`cursorOfFrame` を次にする:

```ts
/** イベントの目盛りを置くカーソル位置（2本目はずらした分も足す） */
export function cursorOfFrame(pitch: ViewerPitch, frame: number, s: ViewState, samples: number, pitchIndex = 0): number | null {
  const index = pitch.frames.findIndex((f) => f.f === frame);
  if (index < 0) return null;
  if (s.sync === 'release') return index - anchorIndex(pitch, s.anchorEvent) + shiftOf(pitchIndex, s);
  if (s.sync === 'frame') return index + shiftOf(pitchIndex, s);
  const progress = pitch.frames[index].p;
  if (progress === null || !pitch.normalized) return null;
  return Math.round((progress / 100) * (samples - 1));
}
```

`src/viewer/ReadoutTable.tsx` の `(Object.entries(payload.panel_series) as [PanelKey, string][])` を `Object.entries(payload.panel_series)` にし、使わなくなった `PanelKey` の import を消す。

- [ ] **Step 5: テストと型を確かめる**

Run: `pnpm vitest run src/viewer src/analysis && pnpm exec tsc -b`
Expected: PASS（既存テストも含めてすべて。型エラーなし）

- [ ] **Step 6: コミット**

```bash
git add src/analysis/types.ts src/analysis/payload.ts src/analysis/payload.test.ts src/viewer/viewerMath.ts src/viewer/viewerMath.test.ts src/viewer/ReadoutTable.tsx
git commit -m "feat: 比較画面の計算を、基準の瞬間の名前と2本目のずらしに対応させる

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 比較画面の文言をデータから作り、2本目をずらす操作を足す

**Files:**
- Create: `src/viewer/presentation.ts`
- Create: `src/viewer/ShiftControl.tsx`
- Modify: `src/viewer/ViewerSettings.tsx`
- Modify: `src/viewer/draw.ts`
- Modify: `src/viewer/ReadoutTable.tsx`
- Modify: `src/viewer/ComparisonViewer.tsx`
- Test: `src/viewer/ComparisonViewer.test.tsx`（追記）

**Interfaces:**
- Consumes: Task 1 の `pitchCursor`・`shiftLimit`・`cursorOfFrame(…, pitchIndex)`・`ViewState.anchorEvent/shift`・`ViewerPayload` の省略できる項目
- Produces:
  - `interface Presentation { anchorEvent; anchorLabel; progressLabel; progressHint; eventLabels; armLabel; trailLabel; readingNotes: readonly string[] | null }`
  - `PITCHER_PRESENTATION`・`presentationOf(payload: ViewerPayload): Presentation`
  - `ShiftControl({ value, limit, onChange })`
  - `ViewerSettings` の新しい prop `presentation: Presentation`

- [ ] **Step 1: 失敗するテストを書く**

`src/viewer/ComparisonViewer.test.tsx` の末尾に足す（import に `fireEvent` を加える: `import { fireEvent, render, screen, within } from '@testing-library/react';`）:

```tsx
const batterLike: ViewerPayload = {
  ...payload,
  anchor_label: 'インパクト',
  progress_label: 'トップ→インパクト',
  progress_hint: '「進行率」は、トップとインパクトを指定すると選べます。',
  event_labels: { release: 'インパクト' },
  arm_label: '両手',
  trail_label: '手の通り道を表示する',
  reading_notes: ['座標は胴の長さを 1 とした値です。'],
};

describe('ComparisonViewer の文言', () => {
  it('比較用データに書かれた文言で表示する（打者）', () => {
    render(<ComparisonViewer payload={batterLike} />);
    expect(screen.getByRole('option', { name: 'インパクトに合わせる' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '進行率（トップ→インパクト）' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '両手' })).toBeInTheDocument();
    expect(screen.getByText('手の通り道を表示する')).toBeInTheDocument();
    expect(screen.getByText('座標は胴の長さを 1 とした値です。')).toBeInTheDocument();
    expect(screen.getByText(/力そのものではありません/)).toBeInTheDocument();
  });

  it('書かれていなければ投手の文言のまま', () => {
    render(<ComparisonViewer payload={payload} />);
    expect(screen.getByRole('option', { name: 'リリースに合わせる' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '投げる腕' })).toBeInTheDocument();
    expect(screen.getByText('腕の通り道を表示する')).toBeInTheDocument();
  });
});

describe('2本目をずらす', () => {
  const frameRow = () => within(screen.getAllByRole('table').at(-1)!).getByText('フレーム').closest('tr')!;

  it('ボタンで1コマずつずらせて、0に戻せる。2本目の表示コマも変わる', async () => {
    render(<ComparisonViewer payload={payload} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'そろえ方' }), 'frame');
    const second = () => frameRow().querySelectorAll('td')[2].textContent;
    expect(second()).toBe(String(payload.pitches[1].frames[0].f));
    await userEvent.click(screen.getByRole('button', { name: '2本目を1コマ後ろへ' }));
    expect(screen.getByText('+1 コマ')).toBeInTheDocument();
    expect(second()).toBe('—');
    await userEvent.click(screen.getByRole('button', { name: '0に戻す' }));
    expect(screen.getByText('0 コマ')).toBeInTheDocument();
    expect(second()).toBe(String(payload.pitches[1].frames[0].f));
  });

  it('範囲の端より先へはずらさない', async () => {
    render(<ComparisonViewer payload={payload} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'そろえ方' }), 'frame');
    const limit = Math.max(...payload.pitches.map((p) => p.frames.length));
    fireEvent.change(screen.getByRole('slider', { name: '2本目のずれ' }), { target: { value: String(limit) } });
    await userEvent.click(screen.getByRole('button', { name: '2本目を1コマ後ろへ' }));
    expect(screen.getByText(`+${limit} コマ`)).toBeInTheDocument();
  });

  it('進行率でそろえているときは出さない', () => {
    render(<ComparisonViewer payload={payload} />);
    expect(screen.queryByRole('button', { name: '2本目を1コマ後ろへ' })).toBeNull();
  });

  it('1本だけのときは出さない', () => {
    const one = loadFixture('no_events').expected.payload as unknown as ViewerPayload;
    render(<ComparisonViewer payload={one} />);
    expect(screen.queryByRole('button', { name: '2本目を1コマ後ろへ' })).toBeNull();
  });
});
```

（`pair` の既定のそろえ方は進行率。`payload.pitches[1]` は 20 コマ、`[0]` は 40 コマ）

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm vitest run src/viewer/ComparisonViewer.test.tsx`
Expected: FAIL（「インパクトに合わせる」・「2本目を1コマ後ろへ」が見つからない）

- [ ] **Step 3: presentation.ts を作る**

```ts
/**
 * 比較画面の文言と基準の瞬間。比較用データに書かれていればそれを、無ければ投手の文言を使う。
 * 投手の比較用データは Python 版と一致させるため項目を増やさないので、投手の文言はここに持つ。
 */

import type { ViewerPayload } from '../analysis/payload';

export interface Presentation {
  readonly anchorEvent: string;
  readonly anchorLabel: string;
  readonly progressLabel: string;
  readonly progressHint: string;
  readonly eventLabels: Readonly<Record<string, string>>;
  readonly armLabel: string;
  readonly trailLabel: string;
  /** 「読み方」の座標と限界の段落。null なら投手の文を出す */
  readonly readingNotes: readonly string[] | null;
}

export const PITCHER_PRESENTATION: Presentation = {
  anchorEvent: 'release',
  anchorLabel: 'リリース',
  progressLabel: '足接地→リリース',
  progressHint: '「進行率」は、足接地とリリースを指定すると選べます。',
  eventLabels: { foot_contact: '足接地', max_elbow_flexion: '最大屈曲', extension_start: '伸展開始', release: 'リリース' },
  armLabel: '投げる腕',
  trailLabel: '腕の通り道を表示する',
  readingNotes: null,
};

export function presentationOf(payload: ViewerPayload): Presentation {
  const d = PITCHER_PRESENTATION;
  return {
    anchorEvent: payload.anchor_event ?? d.anchorEvent,
    anchorLabel: payload.anchor_label ?? d.anchorLabel,
    progressLabel: payload.progress_label ?? d.progressLabel,
    progressHint: payload.progress_hint ?? d.progressHint,
    eventLabels: payload.event_labels ?? d.eventLabels,
    armLabel: payload.arm_label ?? d.armLabel,
    trailLabel: payload.trail_label ?? d.trailLabel,
    readingNotes: payload.reading_notes ?? d.readingNotes,
  };
}
```

- [ ] **Step 4: ShiftControl.tsx を作る**

```tsx
interface Props {
  readonly value: number;
  /** ずらせる幅（±） */
  readonly limit: number;
  readonly onChange: (next: number) => void;
}

const button = 'min-h-11 min-w-11 shrink-0 rounded-xl border border-current/40 px-2';

/** 2本目を前後にずらす（+n で2本目が n コマ後ろにずれる） */
export function ShiftControl({ value, limit, onChange }: Props) {
  const set = (next: number) => onChange(Math.max(-limit, Math.min(limit, next)));
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="opacity-70">2本目をずらす</span>
        <span className="flex-1 text-right tabular-nums">
          {value > 0 ? '+' : ''}
          {value} コマ
        </span>
        <button type="button" onClick={() => set(0)} disabled={value === 0} className={`${button} disabled:opacity-40`}>
          0に戻す
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="2本目を1コマ前へ" onClick={() => set(value - 1)} className={button}>
          −1
        </button>
        <input
          type="range"
          aria-label="2本目のずれ"
          min={-limit}
          max={limit}
          step={1}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="h-11 min-w-0 flex-1"
        />
        <button type="button" aria-label="2本目を1コマ後ろへ" onClick={() => set(value + 1)} className={button}>
          +1
        </button>
      </div>
    </div>
  );
}
```

（`{value} コマ` は `0 コマ`・`+1 コマ` と表示される。テストは要素の textContent で照合する）

- [ ] **Step 5: ViewerSettings に文言を渡す**

`src/viewer/ViewerSettings.tsx`:
- import に `import type { Presentation } from './presentation';` を足す
- `Props` に `readonly presentation: Presentation;` を足し、関数の引数に `presentation` を加える
- 次の4か所を置き換える:

```tsx
          <option value="progress" disabled={!progressAvailable}>
            進行率（{presentation.progressLabel}）
          </option>
          <option value="release">{presentation.anchorLabel}に合わせる</option>
```

```tsx
          <option value="__arm__">{presentation.armLabel}</option>
```

```tsx
        {presentation.trailLabel}
```

```tsx
        <p className="col-span-2 text-xs opacity-80">{presentation.progressHint}</p>
```

- [ ] **Step 6: draw.ts と ReadoutTable にずらしと軌跡の関節を反映する**

`src/viewer/draw.ts`:
- import に `pitchCursor` を足す
- `drawTrail` の関節の行を次にする:

```ts
  const names = pitch.trail_joints ?? [`${pitch.throwing_side}_wrist`, `${pitch.throwing_side}_elbow`];
  names.forEach((name) => {
```

- `drawScene` の `o.pitchIndexes.forEach((index) => {` の中を、その投球のカーソルで描くようにする:

```ts
  o.pitchIndexes.forEach((index) => {
    const pitch = o.payload.pitches[index];
    const cursor = pitchCursor(o.cursor, index, o.state);
    const frame = frameAt(pitch, cursor, o.state);
    if (!frame) return;
    if (o.trail) drawTrail(ctx, p, o.payload, index, cursor, o.state, COLORS[index]);
    drawStickFigure(ctx, p, frame.k, o.payload.edges, COLORS[index], o.pitchIndexes.length > 1 ? 0.85 : 1);
    if (o.state.vector === 'none') return;
    // 代表値が身体長 0.5 になるようそろえてから、倍率を掛ける
    const gain = (o.arrowScale * 0.5) / o.reference;
    targetNames(pitch, o.state, o.joints).forEach((name) => {
      const point = frame.k[name];
      const v = vectorAt(pitch, cursor, name, o.state);
```

（以降は今のまま）

`src/viewer/ReadoutTable.tsx`:
- import に `pitchCursor` を足す
- `const positions = ...` を `const positions = pitches.map((p, i) => realIndex(p, pitchCursor(cursor, i, state), state));` にする
- 速度の行の `pitches.map((p) => {` を `pitches.map((p, i) => {` にし、中の `vectorAt(p, cursor, name, state)` を `vectorAt(p, pitchCursor(cursor, i, state), name, state)` にする

- [ ] **Step 7: ComparisonViewer に組み込む**

`src/viewer/ComparisonViewer.tsx`:
- 先頭の `EVENT_LABELS` を消し、import に `presentationOf`（`./presentation`）・`ShiftControl`（`./ShiftControl`）・`shiftLimit`（`./viewerMath`）を足す
- 状態の組み立てを次にする（`state` の `useMemo` を置き換える）:

```tsx
  const presentation = useMemo(() => presentationOf(payload), [payload]);
  const [shift, setShift] = useState(0);
  const baseState: ViewState = useMemo(
    () => ({ sync: settings.sync, vector: settings.vector, target: settings.target, anchorEvent: presentation.anchorEvent }),
    [settings.sync, settings.vector, settings.target, presentation.anchorEvent],
  );
  const state: ViewState = useMemo(() => ({ ...baseState, shift }), [baseState, shift]);
```

- `reference` は `baseState` で計算する（ずらしで作り直さない）: `const reference = useMemo(() => referenceMagnitude(payload, baseState), [payload, baseState]);`
- 目盛りを次にする:

```tsx
  const ticks = payload.pitches.flatMap((pitch, index) =>
    Object.entries(pitch.events)
      .filter(([name, e]) => name in presentation.eventLabels && e.frame !== null)
      .map(([name, e]) => ({ name, index, at: cursorOfFrame(pitch, e.frame as number, state, payload.normalized_samples, index) }))
      .filter((t): t is { name: string; index: number; at: number } => t.at !== null),
  );
```

  目盛りの文字は `│{presentation.eventLabels[t.name]}` にする。
- `<ViewerSettings ... />` に `presentation={presentation}` を渡す
- 「読み方」の中身を次にする（投手は今の3段落のまま）:

```tsx
        <div className="space-y-2">
          {presentation.readingNotes ? (
            presentation.readingNotes.map((note) => <p key={note}>{note}</p>)
          ) : (
            <p>座標は身体の大きさ（両肩の幅）を 1 とした値です。原点は足接地のときの腰の中心で、打者の方向を右、上を上にそろえています。</p>
          )}
          <p>
            <span style={{ color: VECTOR_COLORS[0] }}>➜ 矢印</span>は骨格と別の色で描いています。
            <strong>矢印は力そのものではありません。</strong>
            速度は続く2コマの動き、加速度はその変化（3コマ）で、向きが力の向きに当たります。重さが分からないので、大きさは相対的な値です。
          </p>
          {!presentation.readingNotes && (
            <p>2D の映像から見た動きなので、奥行き方向は含みません。2球の差は観測された違いで、原因を示すものではありません。</p>
          )}
        </div>
```

- 画面下の固定バーの `<div className="mx-auto max-w-xl space-y-1">` の先頭（コマのスライダーの上）に足す:

```tsx
          {payload.pitches.length === 2 && settings.sync !== 'progress' && (
            <ShiftControl
              value={shift}
              limit={shiftLimit(payload)}
              onChange={(next) => {
                setPlaying(false);
                setShift(next);
              }}
            />
          )}
```

- 固定バーが高くなる分、`<section className="space-y-4 pb-40">` の余白を、ずらしを出すときだけ広げる: `className={`space-y-4 ${payload.pitches.length === 2 && settings.sync !== 'progress' ? 'pb-64' : 'pb-40'}`}`

- [ ] **Step 8: テストと型を確かめる**

Run: `pnpm vitest run src/viewer && pnpm exec tsc -b`
Expected: PASS（既存の ComparisonViewer・viewerMath のテストも通る）

- [ ] **Step 9: コミット**

```bash
git add src/viewer
git commit -m "feat: 比較画面に2本目をずらす操作を足し、文言を比較用データから作る

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: まとめの表

**Files:**
- Create: `src/viewer/SummaryTable.tsx`
- Modify: `src/viewer/ComparisonViewer.tsx`
- Test: `src/viewer/SummaryTable.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `SummaryItem`・`ViewerPitch.summary`、`diffText`（`viewerMath`）
- Produces: `SummaryTable({ payload })`（まとめが無ければ何も描かない）、`formatSummaryValue(item: SummaryItem): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/viewer/SummaryTable.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import pair from '../analysis/__fixtures__/pair.json';
import type { SummaryItem, ViewerPayload } from '../analysis/payload';
import { formatSummaryValue, SummaryTable } from './SummaryTable';

const base = pair.payload as unknown as ViewerPayload;
const lag = (value: number | null, reason: string | null = null): SummaryItem => ({
  key: 'open_lag_ms', label: '開きの時間差', unit: ' ms', digits: 0, signed: true, value, text: value === null ? null : '腰が先', reason,
});
const head = (value: number | null): SummaryItem => ({
  key: 'head_max_move', label: '頭の最大移動（胴の長さ）', unit: '', digits: 2, signed: false, value, text: null,
  reason: value === null ? 'インパクトを指定すると出ます' : null,
});
const withSummary = (a: SummaryItem[], b: SummaryItem[]): ViewerPayload => ({
  ...base,
  pitches: [{ ...base.pitches[0], summary: a }, { ...base.pitches[1], summary: b }],
});

describe('SummaryTable', () => {
  it('まとめの値を1本目・2本目・差で並べる', () => {
    render(<SummaryTable payload={withSummary([lag(100), head(0.12)], [lag(60), head(0.05)])} />);
    const row = within(screen.getByRole('table', { name: 'まとめ' })).getByText('開きの時間差').closest('tr')!;
    const cells = row.querySelectorAll('td');
    expect(cells[1].textContent).toContain('+100 ms');
    expect(cells[1].textContent).toContain('腰が先');
    expect(cells[2].textContent).toContain('+60 ms');
    expect(cells[3].textContent).toBe('+40');
  });

  it('出せない値は「—」と理由を出し、差は空ける', () => {
    render(<SummaryTable payload={withSummary([lag(100), head(null)], [lag(60), head(0.05)])} />);
    const row = screen.getByText('頭の最大移動（胴の長さ）').closest('tr')!;
    const cells = row.querySelectorAll('td');
    expect(cells[1].textContent).toContain('—');
    expect(cells[1].textContent).toContain('インパクトを指定すると出ます');
    expect(cells[3].textContent).toBe('');
  });

  it('まとめの無い比較用データ（投手）では何も出さない', () => {
    const { container } = render(<SummaryTable payload={base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('数値の書式（符号・桁・単位）', () => {
    expect(formatSummaryValue(lag(-35))).toBe('-35 ms');
    expect(formatSummaryValue(head(0.123))).toBe('0.12');
    expect(formatSummaryValue(lag(null))).toBe('—');
  });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm vitest run src/viewer/SummaryTable.test.tsx`
Expected: FAIL（`./SummaryTable` が無い）

- [ ] **Step 3: SummaryTable.tsx を作る**

```tsx
import type { SummaryItem, ViewerPayload } from '../analysis/payload';
import { COLORS } from './draw';
import { diffText } from './viewerMath';

/** 値と単位（出せなければ「—」） */
export function formatSummaryValue(item: SummaryItem): string {
  if (item.value === null) return '—';
  const number = item.value.toFixed(item.digits);
  return `${item.signed && item.value > 0 ? '+' : ''}${number}${item.unit}`;
}

function Cell({ item }: { readonly item: SummaryItem | null }) {
  if (!item) return <>—</>;
  return (
    <>
      <div>{formatSummaryValue(item)}</div>
      {item.text && <div className="text-xs">{item.text}</div>}
      {item.reason && <div className="text-xs opacity-70">{item.reason}</div>}
    </>
  );
}

/** 1本につき1つのまとめの値（打者のみ）。まとめが無ければ何も描かない */
export function SummaryTable({ payload }: { readonly payload: ViewerPayload }) {
  const pitches = payload.pitches;
  const heads = pitches.find((p) => p.summary && p.summary.length > 0)?.summary ?? [];
  if (heads.length === 0) return null;
  return (
    <table aria-label="まとめ" className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-current/20 text-left">
          <th className="py-1 font-normal opacity-70">まとめ</th>
          {[0, 1].map((i) => (
            <th key={i} className="py-1 text-right">
              {pitches[i] ? (
                <>
                  <span style={{ color: COLORS[i] }}>■</span> {pitches[i].display_name}
                </>
              ) : (
                '—'
              )}
            </th>
          ))}
          <th className="py-1 text-right font-normal opacity-70">差</th>
        </tr>
      </thead>
      <tbody>
        {heads.map((head) => {
          const items = [0, 1].map((i) => pitches[i]?.summary?.find((s) => s.key === head.key) ?? null);
          return (
            <tr key={head.key} className="border-b border-current/10 align-top">
              <td className="py-1 opacity-70">{head.label}</td>
              {items.map((item, i) => (
                <td key={i} className="py-1 text-right">
                  <Cell item={item} />
                </td>
              ))}
              <td className="py-1 text-right">{diffText(items.map((it) => it?.value ?? null), (v) => v.toFixed(head.digits))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: ComparisonViewer に置く**

`src/viewer/ComparisonViewer.tsx` の `<ReadoutTable ... />` の直前に `<SummaryTable payload={payload} />` を置き、import を足す。

- [ ] **Step 5: テストと型を確かめる**

Run: `pnpm vitest run src/viewer && pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/viewer
git commit -m "feat: 比較画面にまとめの表を足す（打者のまとめの値を出す）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: スイング1本の解析（前処理・瞬間・進行率・胴の長さ）

**Files:**
- Create: `src/batting/analyzeSwing.ts`
- Create: `src/batting/syntheticSwing.ts`（テスト用）
- Test: `src/batting/analyzeSwing.test.ts`

**Interfaces:**
- Consumes: `PREPROCESSING`（`analysis/analyzePitch`）、`progressPercent`（`analysis/events`）、`distance`・`midpoint`（`analysis/geometry`）、`applyThreshold`・`interpolateShortGaps`・`smoothTracks`（`analysis/preprocess`）、`pointAt`・`tracksFromPoseJson`（`analysis/tracks`）
- Produces:
  - `type Bats = 'right' | 'left'`
  - `interface SwingConfig { swingId: string; label: string; bats: Bats; fps: number; topFrame: number | null; impactFrame: number | null }`
  - `type SwingEventName = 'swing_start' | 'top' | 'impact' | 'swing_end'`
  - `interface SwingAnalysis { config: SwingConfig; smoothed: Tracks; events: Record<SwingEventName, { name; frame: number | null; source: 'manual' }>; progress: readonly number[]; torsoPx: number | null }`
  - `validateSwingEvents(top: number | null, impact: number | null): string | null`
  - `torsoLength(t: Tracks): number | null`
  - `analyzeSwing(json: PoseJsonInput, config: SwingConfig): SwingAnalysis`
  - テスト用: `syntheticSwing(spec: SwingSpec): PoseJsonInput`、`SWING_TORSO = 100`、`SWING_FPS = 60`

- [ ] **Step 1: 合成スイングを作る**

`src/batting/syntheticSwing.ts`:

```ts
/**
 * テスト用の合成スイング（実在の映像は使わない）。捕手の後方から見た打者の骨格を作る。
 * 右打者の画像座標で作り（x はホームベース側＝右が正）、左打者は左右を反転して、左右の関節名を入れ替える。
 * 腰と肩は、真上から見て 0°（構え。両肩が奥行き方向に重なる）→ 90°（投手側を向く）へシグモイドで回る。
 * テストからだけ使う。
 */

import type { PoseJsonInput } from '../analysis/types';
import type { Bats } from './analyzeSwing';

export const SWING_FPS = 60;
/** 胴の長さ（肩の中点〜腰の中点、画素） */
export const SWING_TORSO = 100;
const WIDTH = 1000;
const CENTER_X = 500;
const SHOULDER_Y = 500;
const HIP_Y = SHOULDER_Y + SWING_TORSO;
const HEAD_Y = 440;
const ANKLE_Y = 800;
/** 投手側を向いたときの肩幅・腰幅の半分（画素）。開きの最大は 2*40/100 = 0.8、腰は 0.6 */
export const SHOULDER_HALF = 40;
export const HIP_HALF = 30;
const EAR_HALF = 8;

export interface SwingSpec {
  readonly bats: Bats;
  /** コマ数（既定 60） */
  readonly frames?: number;
  /** 腰が一番速く回るコマ（既定 28） */
  readonly hipTurnFrame?: number;
  /** 肩が一番速く回るコマ（既定 34） */
  readonly shoulderTurnFrame?: number;
  /** 頭の左右の動き（胴の長さ単位、ホームベース側が正）。既定 0 */
  readonly headDx?: (frame: number) => number;
  /** 前足首の左右の動き（胴の長さ単位、ホームベース側が正）。既定 0 */
  readonly leadAnkleDx?: (frame: number) => number;
  /** 写らなかった関節（実際の関節名）とコマ */
  readonly missing?: readonly { readonly name: string; readonly frames: readonly number[] }[];
}

const turn = (frame: number, center: number) => Math.PI / 2 / (1 + Math.exp(-(frame - center) / 3));

type Role = 'lead' | 'rear';

function nameOf(role: Role, part: string, bats: Bats): string {
  const lead = bats === 'right' ? 'left' : 'right';
  const rear = lead === 'left' ? 'right' : 'left';
  return `${role === 'lead' ? lead : rear}_${part}`;
}

export function syntheticSwing(spec: SwingSpec): PoseJsonInput {
  const count = spec.frames ?? 60;
  const hipAt = spec.hipTurnFrame ?? 28;
  const shoulderAt = spec.shoulderTurnFrame ?? 34;
  const headDx = spec.headDx ?? (() => 0);
  const ankleDx = spec.leadAnkleDx ?? (() => 0);
  const mirror = (x: number) => (spec.bats === 'right' ? x : WIDTH - x);
  const isMissing = (name: string, frame: number) =>
    (spec.missing ?? []).some((m) => m.name === name && m.frames.includes(frame));
  return {
    meta: { fps: SWING_FPS, pitch_id: `synthetic_${spec.bats}` },
    frames: Array.from({ length: count }, (_, f) => {
      const hip = Math.sin(turn(f, hipAt));
      const shoulder = Math.sin(turn(f, shoulderAt));
      const headX = CENTER_X + headDx(f) * SWING_TORSO;
      const roles: Readonly<Record<string, readonly [number, number]>> = {
        'lead:shoulder': [CENTER_X - SHOULDER_HALF * shoulder, SHOULDER_Y],
        'rear:shoulder': [CENTER_X + SHOULDER_HALF * shoulder, SHOULDER_Y],
        'lead:hip': [CENTER_X - HIP_HALF * hip, HIP_Y],
        'rear:hip': [CENTER_X + HIP_HALF * hip, HIP_Y],
        'lead:ear': [headX - EAR_HALF, HEAD_Y],
        'rear:ear': [headX + EAR_HALF, HEAD_Y],
        'lead:wrist': [CENTER_X + 20 + f, 470],
        'rear:wrist': [CENTER_X + 30 + f, 480],
        'lead:ankle': [CENTER_X - 20 + ankleDx(f) * SWING_TORSO, ANKLE_Y],
        'rear:ankle': [CENTER_X + 20, ANKLE_Y],
      };
      const keypoints = Object.fromEntries(
        Object.entries(roles).map(([key, [x, y]]) => {
          const [role, part] = key.split(':') as [Role, string];
          const name = nameOf(role, part, spec.bats);
          const value: readonly [number | null, number | null, number] = isMissing(name, f) ? [null, null, 0] : [mirror(x), y, 0.9];
          return [name, value];
        }),
      );
      return { frame_index: f, timestamp_sec: f / SWING_FPS, keypoints };
    }),
  };
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/batting/analyzeSwing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { analyzeSwing, type SwingConfig, torsoLength, validateSwingEvents } from './analyzeSwing';
import { SWING_TORSO, syntheticSwing } from './syntheticSwing';

const config = (over: Partial<SwingConfig> = {}): SwingConfig => ({
  swingId: 's', label: '', bats: 'right', fps: 60, topFrame: null, impactFrame: null, ...over,
});
const all = Array.from({ length: 60 }, (_, i) => i);

describe('validateSwingEvents', () => {
  it('インパクトがトップより後なら通す。どちらか未指定でも通す', () => {
    expect(validateSwingEvents(20, 40)).toBeNull();
    expect(validateSwingEvents(null, 40)).toBeNull();
    expect(validateSwingEvents(20, null)).toBeNull();
  });

  it('インパクトがトップより前か同じなら止める', () => {
    expect(validateSwingEvents(40, 20)).toBe('インパクトはトップより後のコマにしてください');
    expect(validateSwingEvents(20, 20)).toBe('インパクトはトップより後のコマにしてください');
  });
});

describe('analyzeSwing', () => {
  it('胴の長さ（肩の中点〜腰の中点の中央値）を大きさの基準にする', () => {
    const a = analyzeSwing(syntheticSwing({ bats: 'right' }), config());
    expect(a.torsoPx).toBeCloseTo(SWING_TORSO, 1);
  });

  it('肩がどのコマにも写っていなければ、胴の長さは null', () => {
    const json = syntheticSwing({
      bats: 'right',
      missing: [{ name: 'left_shoulder', frames: all }, { name: 'right_shoulder', frames: all }],
    });
    expect(torsoLength(analyzeSwing(json, config()).smoothed)).toBeNull();
  });

  it('進行率はトップ=0%、インパクト=100%、区間外は NaN', () => {
    const a = analyzeSwing(syntheticSwing({ bats: 'right' }), config({ topFrame: 20, impactFrame: 40 }));
    expect(a.events.top.frame).toBe(20);
    expect(a.events.impact.frame).toBe(40);
    expect(a.events.swing_start.frame).toBe(0);
    expect(a.events.swing_end.frame).toBe(59);
    expect(a.progress[20]).toBe(0);
    expect(a.progress[30]).toBeCloseTo(50, 6);
    expect(a.progress[40]).toBe(100);
    expect(a.progress[10]).toBeNaN();
    expect(a.progress[50]).toBeNaN();
  });

  it('トップが無ければ進行率は全コマ NaN（エラーにしない）', () => {
    const a = analyzeSwing(syntheticSwing({ bats: 'right' }), config({ impactFrame: 40 }));
    expect(a.progress.every(Number.isNaN)).toBe(true);
  });
});
```

- [ ] **Step 3: 失敗を確かめる**

Run: `pnpm vitest run src/batting/analyzeSwing.test.ts`
Expected: FAIL（`./analyzeSwing` が無い）

- [ ] **Step 4: analyzeSwing.ts を作る**

```ts
/**
 * 打者のスイング1本分の解析（設計書 §14）。投手の解析（analysis/analyzePitch.ts）とは分け、前処理だけ共通で使う。
 * 流れ: 信頼度フィルタ → 短い欠損の補間 → 平滑化 → 瞬間（手動指定のみ）→ 進行率（トップ=0%、インパクト=100%）→ 胴の長さ。
 */

import { PREPROCESSING } from '../analysis/analyzePitch';
import { progressPercent } from '../analysis/events';
import { distance, midpoint } from '../analysis/geometry';
import { applyThreshold, interpolateShortGaps, smoothTracks } from '../analysis/preprocess';
import { pointAt, tracksFromPoseJson } from '../analysis/tracks';
import type { PoseJsonInput, Tracks } from '../analysis/types';

export type Bats = 'right' | 'left';

export interface SwingConfig {
  readonly swingId: string;
  readonly label: string;
  readonly bats: Bats;
  readonly fps: number;
  readonly topFrame: number | null;
  readonly impactFrame: number | null;
}

export type SwingEventName = 'swing_start' | 'top' | 'impact' | 'swing_end';

export interface SwingEvent {
  readonly name: SwingEventName;
  readonly frame: number | null;
  readonly source: 'manual';
}

export interface SwingAnalysis {
  readonly config: SwingConfig;
  readonly smoothed: Tracks;
  readonly events: Readonly<Record<SwingEventName, SwingEvent>>;
  /** トップ=0%、インパクト=100% の進行率（区間外は NaN） */
  readonly progress: readonly number[];
  /** 胴の長さ（画素）。決まらなければ null */
  readonly torsoPx: number | null;
}

export function validateSwingEvents(top: number | null, impact: number | null): string | null {
  if (top !== null && impact !== null && impact <= top) return 'インパクトはトップより後のコマにしてください';
  return null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 胴の長さ（肩の中点〜腰の中点の距離の、全コマでの中央値、画素）。回転で変わる肩幅の代わりに大きさの基準にする */
export function torsoLength(t: Tracks): number | null {
  const values = t.frameIndices
    .map((_, i) =>
      distance(
        midpoint(pointAt(t, 'left_shoulder', i), pointAt(t, 'right_shoulder', i)),
        midpoint(pointAt(t, 'left_hip', i), pointAt(t, 'right_hip', i)),
      ),
    )
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length === 0) return null;
  const length = median(values);
  return length > 0 ? length : null;
}

export function analyzeSwing(json: PoseJsonInput, config: SwingConfig): SwingAnalysis {
  const p = PREPROCESSING;
  const smoothed = smoothTracks(
    interpolateShortGaps(applyThreshold(tracksFromPoseJson(json), p.confidenceThreshold), p.maxGapFrames),
    p.smoothingWindow,
    p.smoothingPolyorder,
  );
  const frames = smoothed.frameIndices;
  const positionOf = (frame: number | null) => {
    if (frame === null) return null;
    const i = frames.indexOf(frame);
    return i < 0 ? null : i;
  };
  const event = (name: SwingEventName, frame: number | null): SwingEvent => ({ name, frame, source: 'manual' });
  return {
    config,
    smoothed,
    events: {
      swing_start: event('swing_start', frames.length > 0 ? frames[0] : null),
      top: event('top', config.topFrame),
      impact: event('impact', config.impactFrame),
      swing_end: event('swing_end', frames.length > 0 ? frames[frames.length - 1] : null),
    },
    progress: progressPercent(frames.length, positionOf(config.topFrame), positionOf(config.impactFrame)),
    torsoPx: torsoLength(smoothed),
  };
}
```

- [ ] **Step 5: テストと型を確かめる**

Run: `pnpm vitest run src/batting && pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/batting
git commit -m "feat: 打者のスイング1本分の解析（前処理・瞬間・進行率・胴の長さ）を足す

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 比較画面の座標への変換とグラフ6項目

**Files:**
- Create: `src/batting/swingFrames.ts`
- Create: `src/batting/swingSeries.ts`
- Test: `src/batting/swingSeries.test.ts`

**Interfaces:**
- Consumes: Task 4 の `SwingAnalysis`・`Bats`、Task 1 の `round`・`ViewerDataError`・`ViewerFrame`・`XY`
- Produces:
  - `HANDS = 'hands'`、`plateSign(bats): 1 | -1`、`leadSideOf(bats): 'left' | 'right'`、`rearSideOf(bats)`
  - `swingOrigin(a: SwingAnalysis): Point`（腰が無ければ `ViewerDataError`）
  - `swingFrames(a: SwingAnalysis, origin: Point, scale: number): ViewerFrame[]`
  - `type SwingPanelKey = 'shoulder_open' | 'hip_open' | 'head_x' | 'head_y' | 'hands_x' | 'hands_y'`、`SWING_PANELS`
  - `headOf(k): XY | null`
  - `swingSeries(frames: readonly ViewerFrame[], bats: Bats): Record<SwingPanelKey, number[]>`

- [ ] **Step 1: 失敗するテストを書く**

`src/batting/swingSeries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ViewerDataError } from '../analysis/payload';
import { analyzeSwing, type Bats } from './analyzeSwing';
import { HANDS, swingFrames, swingOrigin } from './swingFrames';
import { swingSeries } from './swingSeries';
import { type SwingSpec, syntheticSwing } from './syntheticSwing';

const all = Array.from({ length: 60 }, (_, i) => i);
const framesOf = (spec: SwingSpec) => {
  const a = analyzeSwing(syntheticSwing(spec), {
    swingId: 's', label: '', bats: spec.bats, fps: 60, topFrame: null, impactFrame: null,
  });
  return swingFrames(a, swingOrigin(a), a.torsoPx!);
};
const seriesOf = (spec: SwingSpec) => swingSeries(framesOf(spec), spec.bats);

describe('swingFrames', () => {
  it('原点は構えの腰の中点、大きさは胴の長さ、上が正', () => {
    const [first] = framesOf({ bats: 'right' });
    const hip = [(first.k.left_hip[0] + first.k.right_hip[0]) / 2, (first.k.left_hip[1] + first.k.right_hip[1]) / 2];
    expect(hip[0]).toBeCloseTo(0, 3);
    expect(hip[1]).toBeCloseTo(0, 3);
    expect(first.k.left_shoulder[1]).toBeCloseTo(1, 2);
  });

  it('両手首の中点を hands として足す', () => {
    const frames = framesOf({ bats: 'right' });
    // 右打者の手首は画素で (525+f, 475) の中点 → X=(25+f)/100、Y=(600-475)/100
    expect(frames[10].k[HANDS][0]).toBeCloseTo(0.35, 2);
    expect(frames[10].k[HANDS][1]).toBeCloseTo(1.25, 2);
  });

  it('片方の手首が欠けたコマには hands を作らない', () => {
    const frames = framesOf({ bats: 'right', missing: [{ name: 'right_wrist', frames: [10, 11, 12, 13, 14, 15] }] });
    expect(frames[12].k[HANDS]).toBeUndefined();
    expect(frames[20].k[HANDS]).toBeDefined();
  });

  it('腰がどのコマにも写っていなければ、基準点を決められない', () => {
    const a = analyzeSwing(
      syntheticSwing({ bats: 'right', missing: [{ name: 'left_hip', frames: all }, { name: 'right_hip', frames: all }] }),
      { swingId: 's', label: '', bats: 'right', fps: 60, topFrame: null, impactFrame: null },
    );
    expect(() => swingOrigin(a)).toThrow(ViewerDataError);
  });
});

describe('swingSeries', () => {
  it('開きは構えで 0 付近、投手側を向くと肩 0.8・腰 0.6', () => {
    const s = seriesOf({ bats: 'right' });
    expect(s.shoulder_open[0]).toBeCloseTo(0, 1);
    expect(s.hip_open[0]).toBeCloseTo(0, 1);
    expect(s.shoulder_open[59]).toBeCloseTo(0.8, 1);
    expect(s.hip_open[59]).toBeCloseTo(0.6, 1);
  });

  it('左打者を左右反転すると、同じ動きの右打者と同じ値になる', () => {
    const spec = { headDx: (f: number) => 0.002 * f, leadAnkleDx: (f: number) => 0.005 * Math.min(f, 24) };
    const right = seriesOf({ bats: 'right', ...spec });
    const left = seriesOf({ bats: 'left', ...spec });
    (Object.keys(right) as (keyof typeof right)[]).forEach((key) =>
      right[key].forEach((v, i) => expect(left[key][i]).toBeCloseTo(v, 3)),
    );
  });

  it('頭は構えからの移動（両耳の中点）', () => {
    const s = seriesOf({ bats: 'right', headDx: (f) => 0.002 * f });
    expect(s.head_x[0]).toBeCloseTo(0, 3);
    expect(s.head_x[40]).toBeCloseTo(0.08, 2);
    expect(s.head_y[40]).toBeCloseTo(0, 3);
  });

  it('片耳が欠けたコマは頭の値を空ける', () => {
    const s = seriesOf({ bats: 'right', missing: [{ name: 'left_ear', frames: [10, 11, 12, 13, 14, 15] }] });
    expect(s.head_x[12]).toBeNaN();
    expect(s.head_x[20]).not.toBeNaN();
  });

  it('手は両手首の中点の位置', () => {
    const s = seriesOf({ bats: 'right' });
    expect(s.hands_x[10]).toBeCloseTo(0.35, 2);
    expect(s.hands_y[10]).toBeCloseTo(1.25, 2);
  });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm vitest run src/batting/swingSeries.test.ts`
Expected: FAIL（`./swingFrames` が無い）

- [ ] **Step 3: swingFrames.ts を作る**

```ts
/**
 * 打者の骨格を比較画面の座標にする（設計書 §14.4）。
 * 大きさ: 胴の長さ = 1。原点: 構え（腰が写った最初のコマ）の腰の中点。
 * Y は上が正、X はホームベース側が正（背面からだと左打者はホームベースが画面の左なので、左右を反転する）。
 * 両手首の中点を hands という点として足す（片方の手首が欠けたコマには足さない）。
 */

import { midpoint, type Point } from '../analysis/geometry';
import { round, ViewerDataError, type ViewerFrame, type XY } from '../analysis/payload';
import { pointAt } from '../analysis/tracks';
import type { Bats, SwingAnalysis } from './analyzeSwing';

export const HANDS = 'hands';

export type Side = 'left' | 'right';

/** 右打者はホームベースが画面の右（+1）、左打者は左（-1） */
export const plateSign = (bats: Bats): 1 | -1 => (bats === 'right' ? 1 : -1);
/** 前の側（投手に近い側）。右打者は左 */
export const leadSideOf = (bats: Bats): Side => (bats === 'right' ? 'left' : 'right');
/** 後ろの側（捕手に近い側）。右打者は右 */
export const rearSideOf = (bats: Bats): Side => bats;

export function swingOrigin(a: SwingAnalysis): Point {
  const t = a.smoothed;
  for (let i = 0; i < t.frameIndices.length; i += 1) {
    const origin = midpoint(pointAt(t, 'left_hip', i), pointAt(t, 'right_hip', i));
    if (origin) return origin;
  }
  throw new ViewerDataError('腰が写っているコマが無いため、比較の基準点を決められません。打者の全身が写った動画で試してください');
}

export function swingFrames(a: SwingAnalysis, origin: Point, scale: number): ViewerFrame[] {
  const t = a.smoothed;
  const sign = plateSign(a.config.bats);
  const toXY = (p: Point): XY => [round(((p[0] - origin[0]) * sign) / scale, 4), round(-(p[1] - origin[1]) / scale, 4)];
  return t.frameIndices.map((f, position) => {
    const k: Record<string, XY> = {};
    t.names.forEach((name) => {
      const p = pointAt(t, name, position);
      if (p) k[name] = toXY(p);
    });
    const hands = midpoint(pointAt(t, 'left_wrist', position), pointAt(t, 'right_wrist', position));
    if (hands) k[HANDS] = toXY(hands);
    const progress = a.progress[position];
    return { f, t: round(t.timestamps[position], 4), p: Number.isFinite(progress) ? round(progress, 3) : null, k };
  });
}
```

- [ ] **Step 4: swingSeries.ts を作る**

```ts
/**
 * 打者のグラフ6項目（設計書 §14.5）。座標は swingFrames で揃えたもの（胴の長さ = 1、ホームベース側が +X）。
 * 決まらないコマは NaN。
 */

import type { ViewerFrame, XY } from '../analysis/payload';
import type { Bats } from './analyzeSwing';
import { HANDS, leadSideOf, rearSideOf } from './swingFrames';

export type SwingPanelKey = 'shoulder_open' | 'hip_open' | 'head_x' | 'head_y' | 'hands_x' | 'hands_y';

export const SWING_PANELS: Readonly<Record<SwingPanelKey, string>> = {
  shoulder_open: '肩の開き',
  hip_open: '腰の開き',
  head_x: '頭の左右',
  head_y: '頭の上下',
  hands_x: '手の左右',
  hands_y: '手の高さ',
};

/** 頭（両耳の中点）。背面からは鼻・目が写りにくいので耳を使う。片耳でも欠けたら null */
export function headOf(k: Readonly<Record<string, XY>>): XY | null {
  const left = k.left_ear;
  const right = k.right_ear;
  return left && right ? [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2] : null;
}

/** 開き = 後ろ側の X − 前側の X（構えで 0 付近、投手側を向くほど大きい。写った幅なので角度ではない） */
function openOf(k: Readonly<Record<string, XY>>, part: 'shoulder' | 'hip', bats: Bats): number {
  const rear = k[`${rearSideOf(bats)}_${part}`];
  const lead = k[`${leadSideOf(bats)}_${part}`];
  return rear && lead ? rear[0] - lead[0] : Number.NaN;
}

export function swingSeries(frames: readonly ViewerFrame[], bats: Bats): Record<SwingPanelKey, number[]> {
  const heads = frames.map((f) => headOf(f.k));
  // 構えでの頭 = 先頭から見て頭が取れた最初のコマ
  const start = heads.find((h): h is XY => h !== null) ?? null;
  return {
    shoulder_open: frames.map((f) => openOf(f.k, 'shoulder', bats)),
    hip_open: frames.map((f) => openOf(f.k, 'hip', bats)),
    head_x: heads.map((h) => (h && start ? h[0] - start[0] : Number.NaN)),
    head_y: heads.map((h) => (h && start ? h[1] - start[1] : Number.NaN)),
    hands_x: frames.map((f) => f.k[HANDS]?.[0] ?? Number.NaN),
    hands_y: frames.map((f) => f.k[HANDS]?.[1] ?? Number.NaN),
  };
}
```

- [ ] **Step 5: テストと型を確かめる**

Run: `pnpm vitest run src/batting && pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/batting
git commit -m "feat: 打者の骨格を比較用の座標にし、開き・頭・手の系列を出す

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: まとめの値（開きの時間差・頭の最大移動・踏み込みの向き）

**Files:**
- Create: `src/batting/swingSummary.ts`
- Test: `src/batting/swingSummary.test.ts`

**Interfaces:**
- Consumes: Task 1 の `SummaryItem`・`ViewerFrame`、Task 5 の `swingFrames`・`swingOrigin`・`swingSeries`・`SwingPanelKey`・`leadSideOf`、`gradient`（`analysis/geometry`）
- Produces:
  - `STRAIGHT_STRIDE = 0.1`、`MIN_OPEN_SAMPLES = 3`、`NEED_IMPACT = 'インパクトを指定すると出ます'`
  - `openLagMs(shoulder, hip, times, fps, from, to): number | null`
  - `strideLabel(move: number): string`
  - `swingSummary(frames, series, fps, bats, window: { top: number | null; impact: number | null }): SummaryItem[]`（`top`・`impact` はコマの位置。順は `open_lag_ms`・`head_max_move`・`stride_dir`）

- [ ] **Step 1: 失敗するテストを書く**

`src/batting/swingSummary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { analyzeSwing } from './analyzeSwing';
import { swingFrames, swingOrigin } from './swingFrames';
import { swingSeries } from './swingSeries';
import { NEED_IMPACT, openLagMs, strideLabel, swingSummary } from './swingSummary';
import { type SwingSpec, syntheticSwing } from './syntheticSwing';

const summaryOf = (spec: SwingSpec, top: number | null, impact: number | null) => {
  const a = analyzeSwing(syntheticSwing(spec), {
    swingId: 's', label: '', bats: spec.bats, fps: 60, topFrame: top, impactFrame: impact,
  });
  const frames = swingFrames(a, swingOrigin(a), a.torsoPx!);
  const series = swingSeries(frames, spec.bats);
  const items = swingSummary(frames, series, 60, spec.bats, { top, impact });
  return Object.fromEntries(items.map((i) => [i.key, i]));
};

describe('開きの時間差', () => {
  it('腰が6コマ（100ms）先に回れば +100 ms・腰が先', () => {
    const s = summaryOf({ bats: 'right', hipTurnFrame: 28, shoulderTurnFrame: 34 }, null, null);
    expect(Math.abs(s.open_lag_ms.value! - 100)).toBeLessThanOrEqual(17);
    expect(s.open_lag_ms.text).toBe('腰が先');
  });

  it('肩が先なら負の値・肩が先', () => {
    const s = summaryOf({ bats: 'right', hipTurnFrame: 34, shoulderTurnFrame: 28 }, null, null);
    expect(s.open_lag_ms.value!).toBeLessThan(0);
    expect(s.open_lag_ms.text).toBe('肩が先');
  });

  it('探す範囲に値が3コマ未満なら出さない', () => {
    const nan = Number.NaN;
    expect(openLagMs([nan, nan, 1, 2, nan], [0, 1, 2, 3, 4], [0, 0.1, 0.2, 0.3, 0.4], 10, 0, 4)).toBeNull();
    expect(openLagMs([0, 1, 3, 4, 4], [0, 2, 3, 3, 3], [0, 0.1, 0.2, 0.3, 0.4], 10, 0, 4)).toBe(100);
  });
});

describe('頭の最大移動・踏み込みの向き', () => {
  it('インパクトが無ければ理由を出す（開きの時間差は全体から出す）', () => {
    const s = summaryOf({ bats: 'right' }, null, null);
    expect(s.head_max_move.value).toBeNull();
    expect(s.head_max_move.reason).toBe(NEED_IMPACT);
    expect(s.stride_dir.value).toBeNull();
    expect(s.stride_dir.reason).toBe(NEED_IMPACT);
    expect(s.open_lag_ms.value).not.toBeNull();
  });

  it('頭は構えからインパクトまでで一番離れた距離', () => {
    const s = summaryOf({ bats: 'right', headDx: (f) => 0.1 * Math.min(1, f / 45) }, null, 45);
    expect(s.head_max_move.value!).toBeCloseTo(0.1, 1);
  });

  it('前足がホームベース側へ出れば閉じ、外側なら開き、小さければほぼまっすぐ', () => {
    const step = (d: number) => (f: number) => d * Math.min(1, f / 24);
    expect(summaryOf({ bats: 'right', leadAnkleDx: step(0.15) }, null, 40).stride_dir.text).toBe('閉じ（踏み込み）');
    expect(summaryOf({ bats: 'right', leadAnkleDx: step(-0.15) }, null, 40).stride_dir.text).toBe('開き（アウトステップ）');
    expect(summaryOf({ bats: 'right', leadAnkleDx: step(0.05) }, null, 40).stride_dir.text).toBe('ほぼまっすぐ');
    expect(summaryOf({ bats: 'left', leadAnkleDx: step(0.15) }, null, 40).stride_dir.text).toBe('閉じ（踏み込み）');
  });

  it('区分の境目（±0.1 ちょうどはほぼまっすぐ）', () => {
    expect(strideLabel(0.1)).toBe('ほぼまっすぐ');
    expect(strideLabel(0.1001)).toBe('閉じ（踏み込み）');
    expect(strideLabel(-0.1)).toBe('ほぼまっすぐ');
    expect(strideLabel(-0.1001)).toBe('開き（アウトステップ）');
  });

  it('インパクトが先頭のコマでも NaN にしない', () => {
    const s = summaryOf({ bats: 'right' }, null, 0);
    expect(s.head_max_move.value).toBe(0);
    expect(s.stride_dir.value).toBe(0);
    expect(s.stride_dir.text).toBe('ほぼまっすぐ');
  });

  it('前足首が写っていなければ理由を出す', () => {
    const all = Array.from({ length: 60 }, (_, i) => i);
    const s = summaryOf({ bats: 'right', missing: [{ name: 'left_ankle', frames: all }] }, null, 40);
    expect(s.stride_dir.value).toBeNull();
    expect(s.stride_dir.reason).toBe('前足首が写っていません');
  });
});
```

（`openLagMs` の2つめの手計算: 肩の速さ `gradient` = [10, 15, 15, 5, 0] → 最大は位置1（同じ速さなら先のコマ）。腰 = [20, 15, 5, 0, 0] → 位置0。時間差 = (0.1 − 0) × 1000 = 100）

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm vitest run src/batting/swingSummary.test.ts`
Expected: FAIL（`./swingSummary` が無い）

- [ ] **Step 3: swingSummary.ts を作る**

```ts
/**
 * スイング1本分のまとめの値（設計書 §14.5）。出せないときは値を null にし、理由を添える（作った値で埋めない）。
 * 座標は swingFrames で揃えたもの（胴の長さ = 1、ホームベース側が +X）。
 */

import { gradient } from '../analysis/geometry';
import type { SummaryItem, ViewerFrame } from '../analysis/payload';
import type { Bats } from './analyzeSwing';
import { leadSideOf } from './swingFrames';
import type { SwingPanelKey } from './swingSeries';

/** 踏み込みの向きを「ほぼまっすぐ」とみなす幅（胴の長さ単位） */
export const STRAIGHT_STRIDE = 0.1;
/** 開きの時間差を出すのに要る、探す範囲の中で値のあるコマの数 */
export const MIN_OPEN_SAMPLES = 3;
export const NEED_IMPACT = 'インパクトを指定すると出ます';

/** まとめを出す範囲（コマの位置） */
export interface SwingWindow {
  readonly top: number | null;
  readonly impact: number | null;
}

type Head = Omit<SummaryItem, 'value' | 'text' | 'reason'>;

const LAG: Head = { key: 'open_lag_ms', label: '開きの時間差', unit: ' ms', digits: 0, signed: true };
const HEAD: Head = { key: 'head_max_move', label: '頭の最大移動（胴の長さ）', unit: '', digits: 2, signed: false };
const STRIDE: Head = { key: 'stride_dir', label: '踏み込みの向き（胴の長さ）', unit: '', digits: 2, signed: true };

const itemOf = (head: Head, value: number | null, text: string | null, reason: string | null): SummaryItem => ({
  ...head,
  value,
  text,
  reason,
});

/** 開く速さ（中央差分）が最大のコマの位置。範囲に値が足りなければ null。同じ速さなら先のコマ */
function peakVelocity(values: readonly number[], fps: number, from: number, to: number): number | null {
  if (values.slice(from, to + 1).filter(Number.isFinite).length < MIN_OPEN_SAMPLES) return null;
  const velocity = gradient(values, fps);
  let best: number | null = null;
  for (let i = from; i <= to; i += 1) {
    if (Number.isFinite(velocity[i]) && (best === null || velocity[i] > velocity[best])) best = i;
  }
  return best;
}

/** 腰の開く速さが最大のコマ → 肩の開く速さが最大のコマまでの時間（ms、+ は腰が先） */
export function openLagMs(
  shoulder: readonly number[],
  hip: readonly number[],
  times: readonly number[],
  fps: number,
  from: number,
  to: number,
): number | null {
  const s = peakVelocity(shoulder, fps, from, to);
  const h = peakVelocity(hip, fps, from, to);
  return s === null || h === null ? null : Math.round((times[s] - times[h]) * 1000);
}

export function strideLabel(move: number): string {
  if (move > STRAIGHT_STRIDE) return '閉じ（踏み込み）';
  if (move < -STRAIGHT_STRIDE) return '開き（アウトステップ）';
  return 'ほぼまっすぐ';
}

function lagItem(frames: readonly ViewerFrame[], series: Record<SwingPanelKey, number[]>, fps: number, w: SwingWindow): SummaryItem {
  const from = w.top ?? 0;
  const to = w.impact ?? frames.length - 1;
  const lag = openLagMs(series.shoulder_open, series.hip_open, frames.map((f) => f.t), fps, from, to);
  if (lag === null) return itemOf(LAG, null, null, '肩と腰が写っているコマが足りません');
  return itemOf(LAG, lag, lag > 0 ? '腰が先' : lag < 0 ? '肩が先' : '同時', null);
}

function headItem(series: Record<SwingPanelKey, number[]>, w: SwingWindow): SummaryItem {
  if (w.impact === null) return itemOf(HEAD, null, null, NEED_IMPACT);
  const moves = series.head_x
    .slice(0, w.impact + 1)
    .map((x, i) => Math.hypot(x, series.head_y[i]))
    .filter(Number.isFinite);
  if (moves.length === 0) return itemOf(HEAD, null, null, '頭（両耳）が写っていません');
  return itemOf(HEAD, Math.max(...moves), null, null);
}

function strideItem(frames: readonly ViewerFrame[], bats: Bats, w: SwingWindow): SummaryItem {
  if (w.impact === null) return itemOf(STRIDE, null, null, NEED_IMPACT);
  const name = `${leadSideOf(bats)}_ankle`;
  const start = frames.slice(0, w.impact + 1).find((f) => f.k[name])?.k[name];
  const end = frames[w.impact]?.k[name];
  if (!start || !end) return itemOf(STRIDE, null, null, '前足首が写っていません');
  const move = end[0] - start[0];
  return itemOf(STRIDE, move, strideLabel(move), null);
}

export function swingSummary(
  frames: readonly ViewerFrame[],
  series: Record<SwingPanelKey, number[]>,
  fps: number,
  bats: Bats,
  window: SwingWindow,
): SummaryItem[] {
  return [lagItem(frames, series, fps, window), headItem(series, window), strideItem(frames, bats, window)];
}
```

- [ ] **Step 4: テストと型を確かめる**

Run: `pnpm vitest run src/batting && pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/batting
git commit -m "feat: 打者のまとめの値（開きの時間差・頭の最大移動・踏み込みの向き）を出す

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 打者の比較用データと比較の段取り

**Files:**
- Create: `src/batting/swingPayload.ts`
- Create: `src/flow/swingCompare.ts`
- Test: `src/batting/swingPayload.test.ts`、`src/flow/swingCompare.test.ts`

**Interfaces:**
- Consumes: Task 1 の `normalizedFrames`・`jsonNumber`・`SKELETON_EDGES`・`NORMALIZED_SAMPLES`・`ViewerDataError`、Task 4〜6 の全部
- Produces:
  - `buildSwingPayload(analyses: readonly SwingAnalysis[]): ViewerPayload`
  - `BATTER_EVENT_LABELS`・`BATTER_READING_NOTES`
  - `interface SwingCompareInput { json: PoseJsonInput; thumbnails: readonly ImageBitmap[] | null; thumbStride: number; size?: { width: number; height: number } | null; config: SwingConfig }`
  - `buildSwingComparison(inputs: readonly SwingCompareInput[]): { payload: ViewerPayload } | { error: string }`

- [ ] **Step 1: 失敗するテストを書く**

`src/batting/swingPayload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { expectClose } from '../analysis/fixtures';
import { ViewerDataError } from '../analysis/payload';
import { analyzeSwing, type Bats, type SwingConfig } from './analyzeSwing';
import { buildSwingPayload } from './swingPayload';
import { type SwingSpec, syntheticSwing } from './syntheticSwing';

const analysisOf = (spec: SwingSpec, over: Partial<SwingConfig> = {}) =>
  analyzeSwing(syntheticSwing(spec), { swingId: `swing_${spec.bats}`, label: '', bats: spec.bats, fps: 60, topFrame: null, impactFrame: null, ...over });

describe('buildSwingPayload', () => {
  it('打者の比較用データ（基準はインパクト、グラフ6項目、両手、まとめ3つ）', () => {
    const payload = buildSwingPayload([analysisOf({ bats: 'right' }, { impactFrame: 40 })]);
    expect(payload.subject).toBe('batter');
    expect(payload.anchor_event).toBe('impact');
    expect(payload.anchor_label).toBe('インパクト');
    expect(Object.values(payload.panel_series)).toEqual(['肩の開き', '腰の開き', '頭の左右', '頭の上下', '手の左右', '手の高さ']);
    const pitch = payload.pitches[0];
    expect(pitch.scale_mode).toBe('torso_length');
    expect(pitch.arm_joints).toEqual(['hands']);
    expect(pitch.trail_joints).toEqual(['hands']);
    expect(pitch.frames[0].k.hands).toBeDefined();
    expect(pitch.events.impact.frame).toBe(40);
    expect(pitch.summary!.map((s) => s.key)).toEqual(['open_lag_ms', 'head_max_move', 'stride_dir']);
  });

  it('系列は JSON にできる値（NaN は null）', () => {
    const payload = buildSwingPayload([
      analysisOf({ bats: 'right', missing: [{ name: 'left_ear', frames: [10, 11, 12, 13, 14, 15] }] }),
    ]);
    Object.values(payload.pitches[0].series).forEach((values) =>
      values.forEach((v) => expect(v === null || Number.isFinite(v)).toBe(true)),
    );
    expect(payload.pitches[0].series.head_x[12]).toBeNull();
  });

  it('トップも指定したときだけ進行率で並べ直せる', () => {
    expect(buildSwingPayload([analysisOf({ bats: 'right' }, { impactFrame: 40 })]).pitches[0].normalized).toBeNull();
    expect(buildSwingPayload([analysisOf({ bats: 'right' }, { topFrame: 20, impactFrame: 40 })]).pitches[0].normalized).not.toBeNull();
  });

  it('右打者と左打者を並べると、同じ動きなら同じ系列・同じ座標になる', () => {
    const spec = (bats: Bats): SwingSpec => ({ bats, headDx: (f) => 0.002 * f });
    const payload = buildSwingPayload([analysisOf(spec('right'), { impactFrame: 40 }), analysisOf(spec('left'), { impactFrame: 40 })]);
    const [right, left] = payload.pitches;
    expectClose(left.series, right.series, 1e-3);
    expectClose(left.frames[30].k.hands, right.frames[30].k.hands, 1e-3);
  });

  it('胴が写っていなければ、やさしい理由で止める', () => {
    const all = Array.from({ length: 60 }, (_, i) => i);
    const a = analysisOf({ bats: 'right', missing: [{ name: 'left_shoulder', frames: all }, { name: 'right_shoulder', frames: all }] });
    expect(() => buildSwingPayload([a])).toThrow(ViewerDataError);
    expect(() => buildSwingPayload([a])).toThrow(/打者の上半身と腰/);
  });

  it('0本・3本以上は止める', () => {
    expect(() => buildSwingPayload([])).toThrow(ViewerDataError);
    const a = analysisOf({ bats: 'right' });
    expect(() => buildSwingPayload([a, a, a])).toThrow('比べられるのは2本までです');
  });
});
```

`src/flow/swingCompare.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { SwingConfig } from '../batting/analyzeSwing';
import { syntheticSwing } from '../batting/syntheticSwing';
import { buildSwingComparison, type SwingCompareInput } from './swingCompare';

const input = (over: Partial<SwingConfig> = {}): SwingCompareInput => ({
  json: syntheticSwing({ bats: 'right' }),
  thumbnails: null,
  thumbStride: 1,
  config: { swingId: 'a', label: '', bats: 'right', fps: 60, topFrame: null, impactFrame: null, ...over },
});

describe('buildSwingComparison', () => {
  it('2本から打者の比較用データを作る', () => {
    const result = buildSwingComparison([input(), input({ swingId: 'b', impactFrame: 40 })]);
    expect('payload' in result && result.payload.pitches).toHaveLength(2);
  });

  it('トップとインパクトの順番が逆なら、どの動画かを添えて理由を返す', () => {
    expect(buildSwingComparison([input({ topFrame: 40, impactFrame: 20 })])).toEqual({
      error: 'a: インパクトはトップより後のコマにしてください',
    });
  });

  it('作れないときは例外にせず理由を返す', () => {
    const all = Array.from({ length: 60 }, (_, i) => i);
    const broken: SwingCompareInput = {
      ...input(),
      json: syntheticSwing({ bats: 'right', missing: [{ name: 'left_hip', frames: all }, { name: 'right_hip', frames: all }] }),
    };
    const result = buildSwingComparison([broken]);
    expect('error' in result).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm vitest run src/batting/swingPayload.test.ts src/flow/swingCompare.test.ts`
Expected: FAIL（`./swingPayload`・`./swingCompare` が無い）

- [ ] **Step 3: swingPayload.ts を作る**

```ts
/**
 * 打者の比較用データ（設計書 §14.3）。比較画面は投手と共通で、打者の文言・関節・まとめを省略できる項目で渡す。
 */

import {
  jsonNumber, NORMALIZED_SAMPLES, normalizedFrames, SKELETON_EDGES, ViewerDataError, type ViewerPayload, type ViewerPitch,
} from '../analysis/payload';
import type { SwingAnalysis } from './analyzeSwing';
import { HANDS, leadSideOf, swingFrames, swingOrigin } from './swingFrames';
import { SWING_PANELS, type SwingPanelKey, swingSeries } from './swingSeries';
import { swingSummary } from './swingSummary';

export const BATTER_EVENT_LABELS: Readonly<Record<string, string>> = { top: 'トップ', impact: 'インパクト' };

export const BATTER_READING_NOTES: readonly string[] = [
  '座標は胴の長さ（肩の中点から腰の中点まで）を 1 とした値です。原点は構え（動画の先頭）のときの腰の中心で、ホームベース側を右、上を上にそろえています（左打者は左右を反転しています）。',
  '「開き」は、捕手の後ろから見た肩幅・腰幅の写り方から見た値で、角度ではありません。投手の方向（奥行き）の動きは測れません。2本の差は観測された違いで、原因を示すものではありません。',
  '打者の横にいる主審・捕手を途中から追ってしまうことがあります。骨格が急に別の場所へ飛んだら、解析結果の画面で打者をタップして選び直してください。',
];

function positionOf(a: SwingAnalysis, frame: number | null): number | null {
  if (frame === null) return null;
  const i = a.smoothed.frameIndices.indexOf(frame);
  return i < 0 ? null : i;
}

function swingPitch(a: SwingAnalysis): ViewerPitch {
  const c = a.config;
  const scale = a.torsoPx;
  if (scale === null || !Number.isFinite(scale) || scale <= 0) {
    throw new ViewerDataError(
      '胴（肩と腰）が写っているコマが無いため、比較用に大きさをそろえられません。打者の上半身と腰が写った動画で試してください',
    );
  }
  const frames = swingFrames(a, swingOrigin(a), scale);
  const series = swingSeries(frames, c.bats);
  const window = { top: positionOf(a, c.topFrame), impact: positionOf(a, c.impactFrame) };
  return {
    pitch_id: c.swingId,
    label: c.label,
    display_name: c.label ? `${c.swingId} (${c.label})` : c.swingId,
    description: '',
    fps: c.fps,
    // 投手用の項目には、打ち方と前の側を入れる。ホームベース側を右に揃えたので、打者の向きは right
    throwing_hand: c.bats,
    throwing_side: c.bats,
    lead_side: leadSideOf(c.bats),
    batter_direction: 'right',
    scale_px: scale,
    scale_mode: 'torso_length',
    events: Object.fromEntries(Object.entries(a.events).map(([name, e]) => [name, { frame: e.frame, source: e.source }])),
    frames,
    normalized: normalizedFrames(frames),
    series: Object.fromEntries(
      (Object.keys(SWING_PANELS) as SwingPanelKey[]).map((key) => [key, series[key].map(jsonNumber)]),
    ),
    arm_joints: [HANDS],
    trail_joints: [HANDS],
    summary: swingSummary(frames, series, a.smoothed.fps, c.bats, window),
  };
}

export function buildSwingPayload(analyses: readonly SwingAnalysis[]): ViewerPayload {
  if (analyses.length === 0) throw new ViewerDataError('比べるスイングがありません');
  if (analyses.length > 2) throw new ViewerDataError('比べられるのは2本までです');
  return {
    edges: SKELETON_EDGES,
    panel_series: SWING_PANELS,
    normalized_samples: NORMALIZED_SAMPLES,
    pitches: analyses.map(swingPitch),
    subject: 'batter',
    anchor_event: 'impact',
    anchor_label: 'インパクト',
    progress_label: 'トップ→インパクト',
    progress_hint: '「進行率」は、トップとインパクトを指定すると選べます。',
    event_labels: BATTER_EVENT_LABELS,
    arm_label: '両手',
    trail_label: '手の通り道を表示する',
    reading_notes: BATTER_READING_NOTES,
  };
}
```

- [ ] **Step 4: swingCompare.ts を作る**

```ts
/**
 * 打者の比較の段取り: pose.json（解析結果 or 保存したファイル）＋指定した瞬間 → 比較用データ。
 */

import { ViewerDataError, type ViewerPayload } from '../analysis/payload';
import type { PoseJsonInput } from '../analysis/types';
import { analyzeSwing, type SwingConfig, validateSwingEvents } from '../batting/analyzeSwing';
import { buildSwingPayload } from '../batting/swingPayload';

export interface SwingCompareInput {
  readonly json: PoseJsonInput;
  /** 動画から解析した場合の縮小画像（保存したファイルを読み込んだ場合は null） */
  readonly thumbnails: readonly ImageBitmap[] | null;
  readonly thumbStride: number;
  /** 元の映像の大きさ（縮小画像に骨格を重ねるため。無ければ骨格だけ描く） */
  readonly size?: { readonly width: number; readonly height: number } | null;
  readonly config: SwingConfig;
}

export function buildSwingComparison(inputs: readonly SwingCompareInput[]): { payload: ViewerPayload } | { error: string } {
  for (const input of inputs) {
    const problem = validateSwingEvents(input.config.topFrame, input.config.impactFrame);
    if (problem) return { error: `${input.config.swingId}: ${problem}` };
  }
  try {
    return { payload: buildSwingPayload(inputs.map((i) => analyzeSwing(i.json, i.config))) };
  } catch (error) {
    if (error instanceof ViewerDataError) return { error: error.message };
    throw error;
  }
}
```

- [ ] **Step 5: テストと型を確かめる**

Run: `pnpm vitest run src/batting src/flow && pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/batting src/flow/swingCompare.ts src/flow/swingCompare.test.ts
git commit -m "feat: 打者の比較用データと比較の段取りを足す

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: pose.json に投手／打者の印を付ける

**Files:**
- Modify: `src/export/poseJson.ts`
- Modify: `src/flow/compare.ts`
- Test: `src/export/poseJson.test.ts`（追記）、`src/flow/compare.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1 の `Subject`
- Produces:
  - `toPoseJson(run, track, meta: { modelLabel: string; selection: 'auto' | 'tap'; subject?: Subject })`（省略時は `'pitcher'`）。出力の `meta.subject` は必ず書く
  - `parsePoseFile(text: string, expected?: Subject): PoseJsonInput`（`meta.subject` があって `expected` と違えば投げる）

- [ ] **Step 1: 失敗するテストを書く**

`src/export/poseJson.test.ts` の `describe('toPoseJson'` の中に足す:

```ts
  it('投手か打者かを meta.subject に書く（省略時は投手）', () => {
    expect(json.meta.subject).toBe('pitcher');
    const batter = toPoseJson(run, [person(1)], { modelLabel: 'm', selection: 'auto', subject: 'batter' });
    expect(batter.meta.subject).toBe('batter');
    expect(batter.meta.notes.join()).toContain('打者は最も大きい人物');
    const tapped = toPoseJson(run, [person(1)], { modelLabel: 'm', selection: 'tap', subject: 'batter' });
    expect(tapped.meta.notes.join()).toContain('打者は画面のタップ');
  });
```

`src/flow/compare.test.ts` の `describe('parsePoseFile'` の中に足す:

```ts
  it('印の無い古いファイルは、投手・打者どちらでも読める', () => {
    const text = JSON.stringify(loadFixture('clean_right').input);
    expect(() => parsePoseFile(text, 'pitcher')).not.toThrow();
    expect(() => parsePoseFile(text, 'batter')).not.toThrow();
  });

  it('投手と打者を取り違えたファイルは読み込まない', () => {
    const input = loadFixture('clean_right').input;
    const pitcher = JSON.stringify({ ...input, meta: { ...input.meta, subject: 'pitcher' } });
    const batter = JSON.stringify({ ...input, meta: { ...input.meta, subject: 'batter' } });
    expect(() => parsePoseFile(pitcher, 'batter')).toThrow('投手の解析結果です');
    expect(() => parsePoseFile(batter, 'pitcher')).toThrow('打者の解析結果です');
    expect(parsePoseFile(batter, 'batter').meta.subject).toBe('batter');
    expect(() => parsePoseFile(batter)).not.toThrow();
  });
```

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm vitest run src/export/poseJson.test.ts src/flow/compare.test.ts`
Expected: FAIL（`meta.subject` が undefined、取り違えで投げない）

- [ ] **Step 3: poseJson.ts を書き換える**

- 先頭の説明に1行足す: ` * meta.subject（投手 / 打者）は Python 版では読み飛ばされる（adapters/json_adapter.py は使う項目だけ読む）。`
- import に `import type { Subject } from '../analysis/types';` を足す
- `PoseJson.meta` に `readonly subject: Subject;` を足す（`adapter` の次）
- `toPoseJson` を次にする:

```ts
export function toPoseJson(
  run: { fileName: string; fps: number },
  track: readonly (Person | null)[],
  meta: { modelLabel: string; selection: 'auto' | 'tap'; subject?: Subject },
): PoseJson {
  const subject = meta.subject ?? 'pitcher';
  const who = subject === 'batter' ? '打者' : '投手';
  const selectionNote =
    meta.selection === 'tap'
      ? `${who}は画面のタップで選んだ`
      : `${who}は最も大きい人物を自動で選んだ。別人を拾っていないか確認すること`;
  return {
    schema_version: SCHEMA_VERSION,
    meta: {
      pitch_id: stem(run.fileName),
      fps: run.fps,
      video_path: run.fileName,
      adapter: `cap-pose-lab(${meta.modelLabel})`,
      subject,
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

- [ ] **Step 4: compare.ts を書き換える**

- import に `import type { PoseJsonInput, Subject } from '../analysis/types';`（既存の `PoseJsonInput` の import をこれにまとめる）
- `PoseFileSchema` の `meta` を次にする:

```ts
  meta: z.object({ fps: z.number().positive(), pitch_id: z.string(), subject: z.enum(['pitcher', 'batter']).optional() }).loose(),
```

- `NOT_POSE_FILE` の下に足す:

```ts
/** 期待したモードと違う解析結果を選んだときの案内（キーは期待したモード） */
const WRONG_SUBJECT: Readonly<Record<Subject, string>> = {
  pitcher: '打者の解析結果です（投手のフォームを比べるには、投手の解析結果を選んでください）',
  batter: '投手の解析結果です（打者のスイングを比べるには、打者の解析結果を選んでください）',
};
```

- `parsePoseFile` を次にする:

```ts
/** 保存した pose.json を読む。expected を渡すと、印（meta.subject）が違うファイルを断る（印の無い古いファイルは通す） */
export function parsePoseFile(text: string, expected?: Subject): PoseJsonInput {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(NOT_POSE_FILE, { cause: error });
  }
  const parsed = PoseFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error(NOT_POSE_FILE, { cause: parsed.error });
  const subject = parsed.data.meta.subject;
  if (expected && subject && subject !== expected) throw new Error(WRONG_SUBJECT[expected]);
  return parsed.data;
}
```

- [ ] **Step 5: テストと型を確かめる**

Run: `pnpm vitest run src/export src/flow && pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/export src/flow/compare.ts src/flow/compare.test.ts
git commit -m "feat: pose.json に投手・打者の印を付け、取り違えたファイルを断る

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 打者の指定画面（共通部品の切り出しを含む）

**Files:**
- Create: `src/ui/Choice.tsx`
- Create: `src/ui/FrameScrubber.tsx`
- Create: `src/ui/CompareShell.tsx`
- Create: `src/ui/SwingMarker.tsx`
- Create: `src/ui/SwingCompareFlow.tsx`
- Modify: `src/ui/EventMarker.tsx`
- Modify: `src/ui/CompareFlow.tsx`
- Test: `src/ui/SwingMarker.test.tsx`、`src/ui/SwingCompareFlow.test.tsx`（`EventMarker.test.tsx`・`CompareFlow.test.tsx` は変えずに通すこと）

**Interfaces:**
- Consumes: Task 4 の `SwingConfig`・`Bats`・`validateSwingEvents`、Task 7 の `SwingCompareInput`・`buildSwingComparison`
- Produces:
  - `Choice<T extends string>({ name, value, options, onPick })`
  - `FrameScrubber({ frames, thumbnails, thumbStride, size, position, onPosition })`（`onPosition: Dispatch<SetStateAction<number>>`）
  - `CompareShell<C>({ initial, intro, renderMarker, build, onExit, exitLabel })`
  - `SwingMarker({ input: SwingCompareInput, onChange: (config: SwingConfig) => void })`
  - `SwingCompareFlow({ inputs: readonly SwingCompareInput[], onExit, exitLabel? })`

- [ ] **Step 1: 失敗するテストを書く**

`src/ui/SwingMarker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SwingConfig } from '../batting/analyzeSwing';
import { syntheticSwing } from '../batting/syntheticSwing';
import { SwingMarker } from './SwingMarker';

const json = syntheticSwing({ bats: 'right' });
const config: SwingConfig = { swingId: 'a', label: '', bats: 'right', fps: 60, topFrame: null, impactFrame: null };

describe('SwingMarker', () => {
  it('表示中のコマをトップ・インパクトに指定でき、順番が逆なら理由を出す', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<SwingMarker input={{ json, thumbnails: null, thumbStride: 1, config }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '次のコマ' }));
    await userEvent.click(screen.getByRole('button', { name: 'このコマをトップにする' }));
    const next = onChange.mock.calls.at(-1)?.[0] as SwingConfig;
    expect(next.topFrame).toBe(1);
    rerender(<SwingMarker input={{ json, thumbnails: null, thumbStride: 1, config: next }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '前のコマ' }));
    await userEvent.click(screen.getByRole('button', { name: 'このコマをインパクトにする' }));
    expect(screen.getByText(/インパクトはトップより後/)).toBeInTheDocument();
  });

  it('打ち方を切り替えられる', async () => {
    const onChange = vi.fn();
    render(<SwingMarker input={{ json, thumbnails: null, thumbStride: 1, config }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '左打ち' }));
    expect((onChange.mock.calls.at(-1)?.[0] as SwingConfig).bats).toBe('left');
  });

  it('指定を取り消せる', async () => {
    const onChange = vi.fn();
    render(<SwingMarker input={{ json, thumbnails: null, thumbStride: 1, config: { ...config, impactFrame: 3 } }} onChange={onChange} />);
    expect(screen.getByText(/インパクト: 3/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'インパクトを取り消す' }));
    expect((onChange.mock.calls.at(-1)?.[0] as SwingConfig).impactFrame).toBeNull();
  });
});
```

`src/ui/SwingCompareFlow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { syntheticSwing } from '../batting/syntheticSwing';
import type { SwingCompareInput } from '../flow/swingCompare';
import { SwingCompareFlow } from './SwingCompareFlow';

const input = (swingId: string, impactFrame: number | null): SwingCompareInput => ({
  json: syntheticSwing({ bats: 'right' }),
  thumbnails: null,
  thumbStride: 1,
  config: { swingId, label: '', bats: 'right', fps: 60, topFrame: null, impactFrame },
});

describe('SwingCompareFlow', () => {
  it('トップとインパクトの説明を出し、「比べる」で打者の比較画面に進む', async () => {
    render(<SwingCompareFlow inputs={[input('a', 40), input('b', 42)]} onExit={() => undefined} />);
    expect(screen.getByText(/「トップ」/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '比べる' }));
    expect(screen.getByRole('option', { name: 'インパクトに合わせる' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'まとめ' })).toBeInTheDocument();
    expect(screen.getByText('開きの時間差')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '指定をやり直す' }));
    expect(screen.getByRole('button', { name: '比べる' })).toBeInTheDocument();
  });

  it('比べられないときは画面内に理由を出す', async () => {
    const all = Array.from({ length: 60 }, (_, i) => i);
    const broken: SwingCompareInput = {
      ...input('a', null),
      json: syntheticSwing({ bats: 'right', missing: [{ name: 'left_hip', frames: all }, { name: 'right_hip', frames: all }] }),
    };
    render(<SwingCompareFlow inputs={[broken]} onExit={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: '比べる' }));
    expect(screen.getByRole('alert')).toHaveTextContent('打者の上半身と腰');
  });
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm vitest run src/ui/SwingMarker.test.tsx src/ui/SwingCompareFlow.test.tsx`
Expected: FAIL（`./SwingMarker`・`./SwingCompareFlow` が無い）

- [ ] **Step 3: Choice と FrameScrubber を切り出す**

`src/ui/Choice.tsx`（`EventMarker.tsx` の `Choice` をそのまま移す）:

```tsx
/** 2〜3択のボタン（ラジオ） */
export function Choice<T extends string>({
  name,
  value,
  options,
  onPick,
}: {
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onPick: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-2">
      {options.map(([v, label]) => (
        <label key={v} className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border-2 ${value === v ? 'border-cyan-600' : 'border-current/20'}`}>
          <input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onPick(v)} aria-label={label} />
          {label}
        </label>
      ))}
    </div>
  );
}
```

`src/ui/FrameScrubber.tsx`:

```tsx
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';

import type { PoseJsonInput } from '../analysis/types';
import { drawPoseFrame } from './drawPose';

interface Props {
  /** frame_index の順に並べたコマ */
  readonly frames: PoseJsonInput['frames'];
  readonly thumbnails: readonly ImageBitmap[] | null;
  readonly thumbStride: number;
  readonly size: { readonly width: number; readonly height: number } | null;
  readonly position: number;
  readonly onPosition: Dispatch<SetStateAction<number>>;
}

const button = 'min-h-11 rounded-xl border border-current/40 px-3';

/** コマ送り（縮小画像＋骨格、スライダー、±1 コマのボタン）。瞬間の指定画面で共通に使う */
export function FrameScrubber({ frames, thumbnails, thumbStride, size, position, onPosition }: Props) {
  const stride = thumbnails ? Math.max(1, thumbStride) : 1;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = frames[position]?.frame_index ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 縮小画像は間引いてあるので、直前の縮小画像を出し、骨格はそのコマのものを描く
    const thumb = thumbnails ? (thumbnails[Math.min(thumbnails.length - 1, Math.floor(position / stride))] ?? null) : null;
    drawPoseFrame(canvas, frames, position, thumb, size);
  }, [frames, position, thumbnails, stride, size]);

  // 連打しても押した回数だけ進むよう、直前の値から計算する
  const move = (delta: number) => onPosition((p) => Math.min(frames.length - 1, Math.max(0, p + delta)));

  return (
    <>
      <canvas ref={canvasRef} className="w-full rounded-lg" />
      <input
        type="range"
        aria-label="コマ"
        min={0}
        max={Math.max(0, frames.length - 1)}
        step={1}
        value={position}
        onChange={(e) => onPosition(Number(e.target.value))}
        className="h-11 w-full"
      />
      <div className="flex gap-2">
        <button type="button" aria-label="前のコマ" className={`${button} flex-1`} onClick={() => move(-1)}>
          ◀ 前
        </button>
        <span className="flex min-h-11 flex-1 items-center justify-center text-sm tabular-nums">コマ {frame ?? '—'}</span>
        <button type="button" aria-label="次のコマ" className={`${button} flex-1`} onClick={() => move(1)}>
          次 ▶
        </button>
      </div>
    </>
  );
}
```

`src/ui/EventMarker.tsx` を次にする（文言・並びは今のまま）:

```tsx
import { useMemo, useState } from 'react';

import type { Hand, PitchConfig } from '../analysis/analyzePitch';
import { type CompareInput, validateEvents } from '../flow/compare';
import { Choice } from './Choice';
import { FrameScrubber } from './FrameScrubber';

interface Props {
  readonly input: CompareInput;
  readonly onChange: (config: PitchConfig) => void;
}

const button = 'min-h-11 rounded-xl border border-current/40 px-3';

/** 1本分の指定: 足接地・リリースのコマ、投げ腕、打者の向き */
export function EventMarker({ input, onChange }: Props) {
  const { json, thumbnails, thumbStride, config } = input;
  const frames = useMemo(() => [...json.frames].sort((a, b) => a.frame_index - b.frame_index), [json]);
  const [position, setPosition] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const frame = frames[position]?.frame_index ?? null;

  const update = (next: PitchConfig) => {
    const reason = validateEvents(next.footContactFrame, next.releaseFrame);
    setProblem(reason);
    if (!reason) onChange(next);
  };

  return (
    <section className="space-y-3 rounded-xl border border-current/20 p-3">
      <p className="font-bold break-all">{config.pitchId}</p>
      <FrameScrubber frames={frames} thumbnails={thumbnails} thumbStride={thumbStride} size={input.size ?? null} position={position} onPosition={setPosition} />
      {/* ここから下（「このコマを足接地にする」のボタンから「打者の向き」の Choice まで）は今のコードをそのまま残す */}
    </section>
  );
}
```

（上のコメント行は書かず、今の `EventMarker.tsx` の `<div className="grid grid-cols-2 gap-2">` から最後の `<Choice<'left' | 'right'> ... />` までを、そのまま `FrameScrubber` の下に置く。消すのは、`canvasRef`・`useEffect`・`stride`・`move`・`drawPoseFrame` の import・canvas／スライダー／前後ボタンの JSX・ファイル内の `Choice` の定義）

- [ ] **Step 4: CompareShell を切り出し、CompareFlow をその上に作り直す**

`src/ui/CompareShell.tsx`:

```tsx
import { Fragment, type ReactNode, useState } from 'react';

import type { ViewerPayload } from '../analysis/payload';
import { ComparisonViewer } from '../viewer/ComparisonViewer';

interface Props<C> {
  readonly initial: readonly C[];
  /** 指定画面の説明 */
  readonly intro: ReactNode;
  readonly renderMarker: (index: number, config: C, onChange: (next: C) => void) => ReactNode;
  readonly build: (configs: readonly C[]) => { payload: ViewerPayload } | { error: string };
  readonly onExit: () => void;
  readonly exitLabel: string;
}

const primary = 'w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white';
const secondary = 'w-full min-h-11 rounded-xl border border-current/40';

/** 瞬間の指定 → 比較ビューア（投手・打者で共通の段取り） */
export function CompareShell<C>({ initial, intro, renderMarker, build, onExit, exitLabel }: Props<C>) {
  const [configs, setConfigs] = useState<C[]>(() => [...initial]);
  const [payload, setPayload] = useState<ViewerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compare = () => {
    const result = build(configs);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setPayload(result.payload);
  };

  if (payload) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={secondary} onClick={() => setPayload(null)}>
            指定をやり直す
          </button>
          <button type="button" className={secondary} onClick={onExit}>
            {exitLabel}
          </button>
        </div>
        <ComparisonViewer payload={payload} />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <p className="text-sm">{intro}</p>
      {configs.map((config, i) => (
        <Fragment key={i}>
          {renderMarker(i, config, (next) => setConfigs((prev) => prev.map((c, k) => (k === i ? next : c))))}
        </Fragment>
      ))}
      {error && (
        <p role="alert" className="rounded-xl border-2 border-red-500 p-3 text-sm">
          {error}
        </p>
      )}
      <button type="button" className={primary} onClick={compare}>
        比べる
      </button>
      <button type="button" className={secondary} onClick={onExit}>
        {exitLabel}
      </button>
    </section>
  );
}
```

`src/ui/CompareFlow.tsx` を次にする（説明文は今と同じ JSX のまま）:

```tsx
import type { PitchConfig } from '../analysis/analyzePitch';
import { buildComparison, type CompareInput } from '../flow/compare';
import { CompareShell } from './CompareShell';
import { EventMarker } from './EventMarker';

interface Props {
  readonly inputs: readonly CompareInput[];
  readonly onExit: () => void;
  /** 戻るボタンの名前（解析結果から来たときは「解析結果に戻る」） */
  readonly exitLabel?: string;
}

/** 足接地・リリースの指定 → 比較ビューア */
export function CompareFlow({ inputs, onExit, exitLabel = '最初に戻る' }: Props) {
  return (
    <CompareShell<PitchConfig>
      initial={inputs.map((i) => i.config)}
      intro={
        <>
          コマを送って、踏み出した足が地面に着いた瞬間を「足接地」、キャップが手から離れた瞬間を「リリース」に指定してください。
          指定しなくても比べられますが、「進行率」でのそろえ方は使えません。
        </>
      }
      renderMarker={(i, config, onChange) => <EventMarker input={{ ...inputs[i], config }} onChange={onChange} />}
      build={(configs) => buildComparison(inputs.map((input, i) => ({ ...input, config: configs[i] })))}
      onExit={onExit}
      exitLabel={exitLabel}
    />
  );
}
```

- [ ] **Step 5: SwingMarker と SwingCompareFlow を作る**

`src/ui/SwingMarker.tsx`:

```tsx
import { useMemo, useState } from 'react';

import { type Bats, type SwingConfig, validateSwingEvents } from '../batting/analyzeSwing';
import type { SwingCompareInput } from '../flow/swingCompare';
import { Choice } from './Choice';
import { FrameScrubber } from './FrameScrubber';

interface Props {
  readonly input: SwingCompareInput;
  readonly onChange: (config: SwingConfig) => void;
}

const button = 'min-h-11 rounded-xl border border-current/40 px-3';

/** 1本分の指定: トップ・インパクトのコマ、打ち方 */
export function SwingMarker({ input, onChange }: Props) {
  const { json, thumbnails, thumbStride, config } = input;
  const frames = useMemo(() => [...json.frames].sort((a, b) => a.frame_index - b.frame_index), [json]);
  const [position, setPosition] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const frame = frames[position]?.frame_index ?? null;

  const update = (next: SwingConfig) => {
    const reason = validateSwingEvents(next.topFrame, next.impactFrame);
    setProblem(reason);
    if (!reason) onChange(next);
  };

  return (
    <section className="space-y-3 rounded-xl border border-current/20 p-3">
      <p className="font-bold break-all">{config.swingId}</p>
      <FrameScrubber frames={frames} thumbnails={thumbnails} thumbStride={thumbStride} size={input.size ?? null} position={position} onPosition={setPosition} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={button} onClick={() => update({ ...config, topFrame: frame })}>
          このコマをトップにする
        </button>
        <button type="button" className={button} onClick={() => update({ ...config, impactFrame: frame })}>
          このコマをインパクトにする
        </button>
      </div>
      <p className="text-sm">
        トップ: {config.topFrame ?? '未指定'}
        {config.topFrame !== null && (
          <button type="button" aria-label="トップを取り消す" className="ml-2 underline" onClick={() => update({ ...config, topFrame: null })}>
            取り消す
          </button>
        )}
        {' ／ '}インパクト: {config.impactFrame ?? '未指定'}
        {config.impactFrame !== null && (
          <button type="button" aria-label="インパクトを取り消す" className="ml-2 underline" onClick={() => update({ ...config, impactFrame: null })}>
            取り消す
          </button>
        )}
      </p>
      {problem && <p className="text-sm text-red-600">{problem}</p>}
      <Choice<Bats> name="打ち方" value={config.bats} options={[['right', '右打ち'], ['left', '左打ち']]} onPick={(v) => update({ ...config, bats: v })} />
    </section>
  );
}
```

`src/ui/SwingCompareFlow.tsx`:

```tsx
import type { SwingConfig } from '../batting/analyzeSwing';
import { buildSwingComparison, type SwingCompareInput } from '../flow/swingCompare';
import { CompareShell } from './CompareShell';
import { SwingMarker } from './SwingMarker';

interface Props {
  readonly inputs: readonly SwingCompareInput[];
  readonly onExit: () => void;
  readonly exitLabel?: string;
}

const INTRO =
  'コマを送って、手が一番捕手側に来た瞬間を「トップ」、キャップを打った（空振りなら打つはずだった）瞬間を「インパクト」に指定してください。' +
  'インパクトを指定すると2本をその瞬間でそろえられ、トップも指定すると「進行率」でもそろえられます。' +
  '指定しなくても、比較画面で2本目をずらして合わせられます。';

/** トップ・インパクトの指定 → 比較ビューア（打者） */
export function SwingCompareFlow({ inputs, onExit, exitLabel = '最初に戻る' }: Props) {
  return (
    <CompareShell<SwingConfig>
      initial={inputs.map((i) => i.config)}
      intro={INTRO}
      renderMarker={(i, config, onChange) => <SwingMarker input={{ ...inputs[i], config }} onChange={onChange} />}
      build={(configs) => buildSwingComparison(inputs.map((input, i) => ({ ...input, config: configs[i] })))}
      onExit={onExit}
      exitLabel={exitLabel}
    />
  );
}
```

- [ ] **Step 6: テストと型を確かめる**

Run: `pnpm vitest run src/ui && pnpm exec tsc -b`
Expected: PASS（`EventMarker.test.tsx`・`CompareFlow.test.tsx` も変えずに通る）

- [ ] **Step 7: コミット**

```bash
git add src/ui
git commit -m "feat: 打者のトップ・インパクトの指定画面を足す（コマ送りと比較の段取りを共通部品にする）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 開始画面から打者モードに入れるようにする

**Files:**
- Modify: `src/ui/StartScreen.tsx`
- Modify: `src/ui/PitcherConfirm.tsx`
- Modify: `src/ui/PoseFileLoader.tsx`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`（追記）

**Interfaces:**
- Consumes: Task 8 の `toPoseJson(…, { subject })`・`parsePoseFile(text, subject)`、Task 9 の `SwingCompareFlow`、Task 7 の `SwingCompareInput`、Task 4 の `SwingConfig`
- Produces: `StartScreen` の新しい prop `onBatter`・`onLoadSavedBatter`、`PitcherConfirm` の prop `who?: '投手' | '打者'`、`PoseFileLoader` の prop `subject: Subject`

- [ ] **Step 1: 失敗するテストを書く**

`src/App.test.tsx` の `describe('App'` の中に足す:

```tsx
  it('はじめに画面から、打者のスイングの比較に進める', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '打者のスイングを比べる' }));
    expect(screen.getByText('この端末で解析できるか確認しています…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('はじめに画面から、保存した打者の結果を読み込んで比べる入口がある', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '保存した打者の結果で比べる' }));
    expect(screen.getByText(/保存した解析結果（_pose.json）を選ぶ/)).toBeInTheDocument();
  });

  it('はじめに画面で、打者の撮り方（捕手の後ろ・構えから）を案内する', () => {
    render(<App />);
    expect(screen.getByText(/捕手の後ろから/)).toBeInTheDocument();
    expect(screen.getByText(/構えから撮り始めて/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: 失敗を確かめる**

Run: `pnpm vitest run src/App.test.tsx`
Expected: FAIL（「打者のスイングを比べる」が見つからない）

- [ ] **Step 3: StartScreen・PitcherConfirm・PoseFileLoader を書き換える**

`src/ui/StartScreen.tsx`:
- props に `onBatter: () => void`・`onLoadSavedBatter: () => void` を足す（`readonly` 付き）
- 「保存した解析結果で比べる」のボタンの直後（軌跡の `<hr />` の前）に足す:

```tsx
      <hr className="border-current/20" />
      <p className="text-sm">捕手の後ろから撮った打者のスイングを2本比べます。構えから撮り始めてください（60fps 以上がおすすめ）。</p>
      <button type="button" onClick={onBatter} className="w-full min-h-11 rounded-xl border border-current/40">
        打者のスイングを比べる
      </button>
      <button type="button" onClick={onLoadSavedBatter} className="w-full min-h-11 rounded-xl border border-current/40">
        保存した打者の結果で比べる
      </button>
```

`src/ui/PitcherConfirm.tsx`:
- `Props` に `/** 選ぶ人の呼び名 */ readonly who?: '投手' | '打者';` を足し、引数を `{ run, track, onPick, who = '投手' }` にする
- 2つの文言を次にする:

```tsx
      <p className="text-sm">青い枠が{who}です。違う場合は{who}をタップしてください。</p>
```

```tsx
      {!pitcher && <p className="text-sm">このコマでは{who}が見つかっていません。コマを動かすか、{who}をタップしてください。</p>}
```

`src/ui/PoseFileLoader.tsx`:
- import に `import type { PoseJsonInput, Subject } from '../analysis/types';`（既存の `PoseJsonInput` の import をまとめる）
- `Props` に `readonly subject: Subject;` を足し、引数を `{ onLoad, subject }` にする
- `parsePoseFile(await file.text())` を `parsePoseFile(await file.text(), subject)` にする

- [ ] **Step 4: App.tsx を書き換える**

- import を足す:

```ts
import type { Subject } from './analysis/types';
import type { SwingConfig } from './batting/analyzeSwing';
import type { SwingCompareInput } from './flow/swingCompare';
import { SwingCompareFlow } from './ui/SwingCompareFlow';
```

- `defaultConfig` の下に足す:

```ts
/** 打者の比較の初期設定。打ち方は指定画面で直してもらう */
function defaultSwingConfig(swingId: string, fps: number): SwingConfig {
  return { swingId, label: '', bats: 'right', fps, topFrame: null, impactFrame: null };
}
```

- `App` の state に足す:

```ts
  const [subject, setSubject] = useState<Subject>('pitcher');
  const [swingInputs, setSwingInputs] = useState<SwingCompareInput[]>([]);
```

- `const modelLabel = ...` の下に、投手・打者で共通の pose.json 作りと、比較の入力作りを置き、`startCompareFromResults` を置き換える:

```ts
  const poseJsonOf = (t: Tracked) => toPoseJson(t.run, t.track, { modelLabel, selection: t.selection, subject });

  /** 比較の入力を、モードに合わせて作る（打者はトップ・インパクト、投手は足接地・リリースを指定する） */
  const openCompare = (
    items: readonly { json: CompareInput['json']; thumbnails: readonly ImageBitmap[] | null; thumbStride: number; size?: CompareInput['size']; id: string; fps: number }[],
    from: 'result' | 'start',
  ) => {
    if (subject === 'batter') {
      setSwingInputs(items.map(({ id, fps, ...rest }) => ({ ...rest, config: defaultSwingConfig(id, fps) })));
    } else {
      setCompareInputs(items.map(({ id, fps, ...rest }) => ({ ...rest, config: defaultConfig(id, fps) })));
    }
    setCompareFrom(from);
    setStep('compare');
  };

  const startCompareFromResults = () =>
    openCompare(
      results.map((t) => ({
        // 保存した pose.json と同じ経路にし、読み込み時と実行時で結果がずれないようにする
        json: poseJsonOf(t),
        thumbnails: t.run.thumbnails,
        thumbStride: t.run.thumbStride,
        size: { width: t.run.width, height: t.run.height },
        id: stem(t.run.fileName),
        fps: t.run.fps,
      })),
      'result',
    );

  const begin = (next: Subject, to: 'setup' | 'load') => {
    setSubject(next);
    setStep(to);
  };
```

- `StartScreen` を次にする:

```tsx
      {step === 'start' && (
        <StartScreen
          onStart={() => begin('pitcher', 'setup')}
          onLoadSaved={() => begin('pitcher', 'load')}
          onBatter={() => begin('batter', 'setup')}
          onLoadSavedBatter={() => begin('batter', 'load')}
          onTrajectory={() => setStep('trajectory')}
        />
      )}
```

- `load` の `PoseFileLoader` を次にする:

```tsx
          <PoseFileLoader
            subject={subject}
            onLoad={(files) =>
              openCompare(
                files.map((f) => ({ json: f.json, thumbnails: null, thumbStride: 1, id: f.json.meta.pitch_id || stem(f.name), fps: f.json.meta.fps })),
                'start',
              )
            }
          />
```

- `compare` を次にする:

```tsx
      {step === 'compare' &&
        (subject === 'batter' ? (
          <SwingCompareFlow
            inputs={swingInputs}
            exitLabel={compareFrom === 'result' ? '解析結果に戻る' : '最初に戻る'}
            onExit={() => setStep(compareFrom)}
          />
        ) : (
          <CompareFlow
            inputs={compareInputs}
            exitLabel={compareFrom === 'result' ? '解析結果に戻る' : '最初に戻る'}
            onExit={() => setStep(compareFrom)}
          />
        ))}
```

- `result` の中を次にする:

```tsx
          {results.map((t, i) => (
            <PitcherConfirm
              key={t.run.fileName}
              run={t.run}
              track={t.track}
              who={subject === 'batter' ? '打者' : '投手'}
              onPick={(f, idx) => repick(i, f, idx)}
            />
          ))}
          <button type="button" onClick={startCompareFromResults} className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white">
            {subject === 'batter' ? 'スイングを比べる（トップとインパクトを指定）' : 'フォームを比べる（足接地とリリースを指定）'}
          </button>
          <ExportPanel
            items={results.map((t) => ({
              fileName: poseJsonFileName(t.run.fileName),
              onSave: () => downloadJson(poseJsonFileName(t.run.fileName), poseJsonOf(t)),
            }))}
          />
```

- [ ] **Step 5: テストと型を確かめる**

Run: `pnpm vitest run src/App.test.tsx src/ui && pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/App.tsx src/App.test.tsx src/ui/StartScreen.tsx src/ui/PitcherConfirm.tsx src/ui/PoseFileLoader.tsx
git commit -m "feat: 開始画面から打者のスイングの比較に入れるようにする

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 説明の更新と全体の確認

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md`（状態の行）

- [ ] **Step 1: README に打者モードを書く**

`README.md` の冒頭の箇条書き（「投球の軌跡と平均球速（試験的）…」の行）の下に足す:

```markdown
- 打者のスイングの比較: 捕手の後ろから撮った打者のスイングを2本比べる。インパクト（任意でトップも）を指定して揃え、比較画面で2本目を前後にずらして合わせられる。肩・腰の開き、頭の動き、手の通り道、踏み込みの向きを出す
```

`## 投球の軌跡の確認（実際の映像で）` の節の後ろに足す:

```markdown
## 打者のスイングの確認（実際の映像で）

1. 捕手の後ろから、構えから振り終わりまでを撮った動画を2本用意する（60fps 以上がおすすめ）
2. 「打者のスイングを比べる」から解析し、青い枠が打者になっているか確かめる（主審・捕手になっていたら打者をタップ）
3. 各動画でインパクト（できればトップも）を指定して「比べる」
4. 確かめること: 骨格が主審・捕手に飛んでいないか、肩・腰の開きが構えで 0 付近から増えていくか、まとめの値（開きの時間差・頭の最大移動・踏み込みの向き）が見た目と合うか
```

- [ ] **Step 2: 設計書の状態を更新する**

`docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md` の2〜3行目の状態の行の `§14 打者モードを 2026-09-29 に追加（計画6 の前提）` を `§14 打者モードを 2026-09-29 に追加し、計画6 で実装` にする。

- [ ] **Step 3: 全体を確かめる**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: すべて PASS（テストの件数は計画前より増える。lint・型・ビルドのエラーなし）

- [ ] **Step 4: コミット**

```bash
git add README.md docs/superpowers/specs/2026-09-28-cap-pose-lab-design.md
git commit -m "docs: 打者のスイングの比較を README と設計書に書く

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
