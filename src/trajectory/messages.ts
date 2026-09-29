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
