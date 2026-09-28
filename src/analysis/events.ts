/**
 * イベント決定と進行率（pitching/events/detector.py と analysis.py の _progress_percent の移植）。
 * 足接地とリリースは手動指定のみ（ポーズの動きだけから断定しない）。
 * 最大肘屈曲は、平滑化後の肘角度の局所最小（探索区間は足接地の少し前〜リリース）。
 */

export type EventName = 'pitch_start' | 'foot_contact' | 'max_elbow_flexion' | 'extension_start' | 'release' | 'pitch_end';

export interface PitchEvent {
  readonly name: EventName;
  readonly frame: number | null;
  readonly source: 'manual' | 'pose_heuristic';
}

export const EVENT_DETECTION = {
  localMinimumOrder: 2,
  extensionMinFrames: 3,
  extensionMinDeltaDeg: 0.5,
  searchMarginFrames: 10,
} as const;

const positionOf = (frames: readonly number[], frame: number | null) => {
  if (frame === null) return null;
  const i = frames.indexOf(frame);
  return i < 0 ? null : i;
};

const frameOf = (frames: readonly number[], position: number | null) =>
  position === null || position < 0 || position >= frames.length ? null : frames[position];

export function searchWindow(length: number, contact: number | null, release: number | null, margin: number): [number, number] {
  const start = contact === null ? 0 : Math.max(0, contact - margin);
  const end = release === null ? length - 1 : Math.min(length - 1, release);
  if (start >= end) return [0, Math.max(0, length - 1)];
  return [start, end];
}

function isLocalMinimum(angles: readonly number[], position: number, order: number, start: number, end: number): boolean {
  const center = angles[position];
  if (!Number.isFinite(center)) return false;
  let higher = 0;
  for (let offset = 1; offset <= order; offset++) {
    for (const neighbour of [position - offset, position + offset]) {
      if (neighbour < start || neighbour > end) continue;
      const value = angles[neighbour];
      if (!Number.isFinite(value)) continue;
      if (value < center) return false;
      if (value > center) higher += 1;
    }
  }
  return higher > 0;
}

export function detectMaxFlexion(angles: readonly number[], start: number, end: number, order: number): number | null {
  if (angles.length === 0 || start > end) return null;
  const minima: number[] = [];
  for (let p = start; p <= end; p++) if (isLocalMinimum(angles, p, order, start, end)) minima.push(p);
  if (minima.length > 0) return minima.reduce((best, p) => (angles[p] < angles[best] ? p : best));
  let best: number | null = null;
  for (let p = start; p <= end; p++) {
    if (Number.isFinite(angles[p]) && (best === null || angles[p] < angles[best])) best = p;
  }
  return best;
}

export function detectExtensionStart(angles: readonly number[], flexion: number | null, minFrames: number, minDelta: number): number | null {
  if (flexion === null || angles.length === 0) return null;
  let streak = 0;
  let streakStart: number | null = null;
  for (let p = flexion + 1; p < angles.length; p++) {
    const previous = angles[p - 1];
    const current = angles[p];
    if (!(Number.isFinite(previous) && Number.isFinite(current))) {
      streak = 0;
      streakStart = null;
      continue;
    }
    if (current - previous >= minDelta) {
      if (streakStart === null) streakStart = p - 1;
      streak += 1;
      if (streak >= minFrames) return streakStart;
    } else {
      streak = 0;
      streakStart = null;
    }
  }
  return null;
}

export function resolveEvents(
  frameIndices: readonly number[],
  elbowAngles: readonly number[],
  opts: { footContactFrame: number | null; releaseFrame: number | null },
): Record<EventName, PitchEvent> {
  const d = EVENT_DETECTION;
  const contactPos = positionOf(frameIndices, opts.footContactFrame);
  const releasePos = positionOf(frameIndices, opts.releaseFrame);
  const [start, end] = searchWindow(elbowAngles.length, contactPos, releasePos, d.searchMarginFrames);
  const flexion = detectMaxFlexion(elbowAngles, start, end, d.localMinimumOrder);
  const extension = detectExtensionStart(elbowAngles, flexion, d.extensionMinFrames, d.extensionMinDeltaDeg);
  const first = frameIndices.length > 0 ? frameIndices[0] : null;
  const last = frameIndices.length > 0 ? frameIndices[frameIndices.length - 1] : null;
  return {
    pitch_start: { name: 'pitch_start', frame: first, source: 'manual' },
    pitch_end: { name: 'pitch_end', frame: last, source: 'manual' },
    foot_contact: { name: 'foot_contact', frame: opts.footContactFrame, source: 'manual' },
    release: { name: 'release', frame: opts.releaseFrame, source: 'manual' },
    max_elbow_flexion: { name: 'max_elbow_flexion', frame: frameOf(frameIndices, flexion), source: 'pose_heuristic' },
    extension_start: { name: 'extension_start', frame: frameOf(frameIndices, extension), source: 'pose_heuristic' },
  };
}

/** 足接地=0%、リリース=100% の進行率。区間外は NaN（外挿した値は出さない） */
export function progressPercent(length: number, start: number | null, end: number | null): number[] {
  const progress = new Array<number>(length).fill(Number.NaN);
  if (start === null || end === null || end <= start) return progress;
  const span = end - start;
  for (let p = start; p <= Math.min(end, length - 1); p++) progress[p] = ((p - start) / span) * 100;
  return progress;
}
