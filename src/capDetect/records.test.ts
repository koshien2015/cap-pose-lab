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
