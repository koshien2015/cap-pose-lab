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
