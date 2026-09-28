import { describe, expect, it } from 'vitest';

import { progressPercent, resolveEvents } from './events';
import { loadFixture } from './fixtures';
import { applyThreshold, interpolateShortGaps, smoothTracks } from './preprocess';
import { elbowAngleSeries } from './series';
import { tracksFromPoseJson } from './tracks';

describe('イベントと進行率（Python 版と一致）', () => {
  it.each(['clean_right', 'noisy_gaps', 'left_mirror', 'no_events', 'release_only', 'fps30'])('%s', (name) => {
    const f = loadFixture(name);
    const t = smoothTracks(interpolateShortGaps(applyThreshold(tracksFromPoseJson(f.input), 0.5), 3), 9, 2);
    const events = resolveEvents(t.frameIndices, elbowAngleSeries(t, f.config.throwing_hand), {
      footContactFrame: f.config.foot_contact_frame,
      releaseFrame: f.config.release_frame,
    });
    for (const [key, frame] of Object.entries(f.expected.events)) {
      expect(events[key as keyof typeof events].frame, key).toBe(frame);
    }
  });

  it('進行率は足接地=0・リリース=100、区間外は NaN（外挿しない）', () => {
    const p = progressPercent(6, 1, 3);
    expect(Number.isNaN(p[0])).toBe(true);
    expect(p.slice(1, 4)).toEqual([0, 50, 100]);
    expect(Number.isNaN(p[4])).toBe(true);
    expect(progressPercent(4, null, 2).every(Number.isNaN)).toBe(true);
    expect(progressPercent(4, 2, 2).every(Number.isNaN)).toBe(true);
  });
});
