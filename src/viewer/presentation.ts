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
