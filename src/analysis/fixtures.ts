/**
 * 数値一致テスト用。tools/make_fixtures.py が Python 版から書き出した期待値を読み、近似比較する。
 * テストからだけ使う。
 */

import { expect } from 'vitest';

import type { PoseJson } from '../export/poseJson';

export interface FixtureConfig {
  readonly pitch_id: string;
  readonly throwing_hand: 'right' | 'left';
  readonly batter_direction: 'left' | 'right';
  readonly fps: number;
  readonly foot_contact_frame: number | null;
  readonly release_frame: number | null;
}

export interface Fixture {
  readonly name: string;
  readonly config: FixtureConfig;
  readonly input: PoseJson;
  readonly expected: {
    readonly frame_indices: number[];
    readonly scale_px: number | null;
    readonly smoothed: Record<string, ([number, number] | null)[]>;
    readonly series: Record<string, (number | null)[]>;
    readonly events: Record<string, number | null>;
    readonly progress: (number | null)[];
    readonly payload: unknown;
  };
}

const modules = import.meta.glob<{ default: Fixture }>('./__fixtures__/*.json', { eager: true });

export function loadFixture(name: string): Fixture {
  const found = modules[`./__fixtures__/${name}.json`];
  if (!found) throw new Error(`fixture がありません: ${name}`);
  return found.default;
}

const isMissing = (v: unknown) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

function compare(actual: unknown, expected: unknown, tol: number, path: string, problems: string[]): void {
  if (problems.length > 20) return;
  if (isMissing(expected) || isMissing(actual)) {
    if (!(isMissing(expected) && isMissing(actual))) problems.push(`${path}: ${String(actual)} != ${String(expected)}`);
    return;
  }
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || Math.abs(actual - expected) > tol) {
      problems.push(`${path}: ${String(actual)} != ${expected}`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      problems.push(`${path}: 長さ ${Array.isArray(actual) ? actual.length : typeof actual} != ${expected.length}`);
      return;
    }
    expected.forEach((e, i) => compare(actual[i], e, tol, `${path}[${i}]`, problems));
    return;
  }
  if (typeof expected === 'object') {
    if (typeof actual !== 'object' || actual === null) {
      problems.push(`${path}: オブジェクトではない`);
      return;
    }
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(e)]);
    keys.forEach((k) => compare(a[k], e[k], tol, `${path}.${k}`, problems));
    return;
  }
  if (actual !== expected) problems.push(`${path}: ${String(actual)} != ${String(expected)}`);
}

/** 数値は |a-b| <= tol、null と NaN は同じ扱いで再帰的に比べる。 */
export function expectClose(actual: unknown, expected: unknown, tol = 2e-4): void {
  const problems: string[] = [];
  compare(actual, expected, tol, '$', problems);
  if (problems.length > 0) expect.fail(`Python 版と一致しません:\n${problems.slice(0, 20).join('\n')}`);
}
