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
