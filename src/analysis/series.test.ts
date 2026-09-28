import { describe, it } from 'vitest';

import { expectClose, loadFixture } from './fixtures';
import { facingSign } from './geometry';
import { applyThreshold, interpolateShortGaps, smoothTracks } from './preprocess';
import {
  bodyScale, elbowAngleSeries, extensionVelocity, forearmAngleSeries, leadKneeAngleSeries, trunkLeanSeries,
} from './series';
import { tracksFromPoseJson } from './tracks';

const nn = (xs: readonly number[]) => xs.map((v) => (Number.isFinite(v) ? v : null));

describe('角度系列と身体サイズ（Python 版と一致）', () => {
  it.each(['clean_right', 'noisy_gaps', 'left_mirror', 'fps30', 'no_shoulders'])('%s', (name) => {
    const f = loadFixture(name);
    const t = smoothTracks(interpolateShortGaps(applyThreshold(tracksFromPoseJson(f.input), 0.5), 3), 9, 2);
    const throwing = f.config.throwing_hand;
    const lead = throwing === 'right' ? 'left' : 'right';
    const sign = facingSign(f.config.batter_direction);
    const elbow = elbowAngleSeries(t, throwing);
    expectClose(nn(elbow), f.expected.series.elbow_angle_deg);
    expectClose(nn(extensionVelocity(elbow, t.fps)), f.expected.series.elbow_extension_velocity_deg_per_sec, 1e-2);
    expectClose(nn(forearmAngleSeries(t, throwing, sign)), f.expected.series.forearm_angle_deg);
    expectClose(nn(leadKneeAngleSeries(t, lead)), f.expected.series.lead_knee_angle_deg);
    expectClose(nn(trunkLeanSeries(t, sign)), f.expected.series.trunk_lean_deg);
    expectClose(bodyScale(t), f.expected.scale_px);
  });
});
