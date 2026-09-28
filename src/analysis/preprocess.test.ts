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
      expectClose(
        smoothed.xy[kp].map(([x, y]) => (Number.isNaN(x) ? null : [x, y])),
        points,
        2e-4,
      );
    }
  });

  it('短い欠損は補間し、長い欠損と先頭の欠損は埋めない', () => {
    const { smoothed } = run('noisy_gaps');
    const knee = smoothed.xy.left_knee.filter(([x]) => Number.isNaN(x)).length;
    expect(knee).toBeGreaterThanOrEqual(6);
    expect(pointAt(smoothed, 'right_wrist', 0)).toBeNull();
    expect(pointAt(smoothed, 'right_elbow', 11)).not.toBeNull();
  });

  it('入力を書き換えない', () => {
    const f = loadFixture('noisy_gaps');
    const tracks = tracksFromPoseJson(f.input);
    const before = JSON.stringify(tracks.xy.right_elbow);
    smoothTracks(interpolateShortGaps(applyThreshold(tracks, 0.5), 3), 9, 2);
    expect(JSON.stringify(tracks.xy.right_elbow)).toBe(before);
  });
});
