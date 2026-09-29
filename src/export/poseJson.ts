/**
 * 投手のキーポイント列を pose.json（SCHEMA_VERSION 1）にする。
 * 形式は ultralytics/shared/pose_export.py と同じで、Python 版の
 * `python -m pitching run --pose <file>` でもそのまま読める。
 * meta.subject（投手 / 打者）は Python 版では読み飛ばされる（adapters/json_adapter.py は使う項目だけ読む）。
 * 推論したフレームは投手がいなくても記録し（[null, null, 0]）、推論していないフレームは記録しない。
 */

import type { Subject } from '../analysis/types';
import type { Person } from '../inference/decodePose';

export const SCHEMA_VERSION = 1;

export const KEYPOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
] as const;

type KeypointName = (typeof KEYPOINT_NAMES)[number];
type KeypointValue = [number | null, number | null, number];

export interface PoseJson {
  readonly schema_version: number;
  readonly meta: {
    readonly pitch_id: string;
    readonly fps: number;
    readonly video_path: string;
    readonly adapter: string;
    readonly subject: Subject;
    readonly notes: readonly string[];
  };
  readonly frames: readonly {
    readonly frame_index: number;
    readonly timestamp_sec: number;
    readonly keypoints: Record<KeypointName, KeypointValue>;
  }[];
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));
const coord = (value: number) => (Number.isFinite(value) ? round(value, 3) : null);

function keypointsOf(person: Person | null): Record<KeypointName, KeypointValue> {
  const entries = KEYPOINT_NAMES.map((name, k): [KeypointName, KeypointValue] => {
    if (!person) return [name, [null, null, 0]];
    const [x, y, conf] = person.keypoints[k];
    return [name, [coord(x), coord(y), round(conf, 4)]];
  });
  return Object.fromEntries(entries) as Record<KeypointName, KeypointValue>;
}

const stem = (fileName: string) => fileName.replace(/\.[^.]+$/, '');

export function poseJsonFileName(fileName: string): string {
  return `${stem(fileName)}_pose.json`;
}

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
