import { describe, expect, it } from 'vitest';

import { analyzeThrow } from './analyzeThrow';
import { SYNTH_FPS, SYNTH_HEIGHT, SYNTH_RELEASE, SYNTH_WIDTH, syntheticThrow } from './syntheticThrow';
import { inferredRanges, toTrajectoryJson, trajectoryJsonFileName, type TrajectoryJsonInput } from './trajectoryJson';

function input(over: Partial<TrajectoryJsonInput> = {}): TrajectoryJsonInput {
  const records = syntheticThrow({ inferred: (f) => f % 5 === 0 || (f >= 96 && f <= 130) });
  const releaseFrame = over.releaseFrame === undefined ? SYNTH_RELEASE : over.releaseFrame;
  return {
    fileName: 'clip.mov',
    fps: SYNTH_FPS,
    width: SYNTH_WIDTH,
    height: SYNTH_HEIGHT,
    frameCount: 200,
    model: { weights: 'yolo8m_20250510.pt', imgsz: 640, preprocess: 'raw' },
    inference: 'sampled',
    releaseFrame,
    releaseSource: releaseFrame === null ? 'none' : 'auto',
    records,
    analysis: analyzeThrow({ records, fps: SYNTH_FPS, frameHeight: SYNTH_HEIGHT, releaseFrame }),
    ...over,
  };
}

describe('inferredRanges', () => {
  it('推論したコマを [start, end) の範囲にまとめる（並びや重複があっても）', () => {
    expect(inferredRanges([10, 0, 5, 6, 7, 6])).toEqual([[0, 1], [5, 8], [10, 11]]);
    expect(inferredRanges([])).toEqual([]);
  });
});

describe('toTrajectoryJson', () => {
  it('設計書 §9.5 の形で書き出す', () => {
    const json = toTrajectoryJson(input());
    expect(json.schema).toBe('cap-pose-lab/trajectory');
    expect(json.version).toBe(1);
    expect(json.video).toEqual({ file: 'clip.mov', fps: 60, width: 1920, height: 1080, frameCount: 200 });
    expect(json.model).toEqual({ weights: 'yolo8m_20250510.pt', imgsz: 640, preprocess: 'raw', conf: 0.15 });
    expect(json.release).toEqual({ frame: 100, source: 'auto' });
    expect(json.inferredFrames[0]).toEqual([0, 1]);
    expect(json.detections).toHaveLength(24);
    expect(json.fit?.inlierFrames).toHaveLength(24);
    expect(json.trajectory.every((p) => typeof p.interpolated === 'boolean')).toBe(true);
    expect(json.speedKmh).toBe(86.6);
  });

  it('フィットできなければ fit と speedKmh は null', () => {
    const json = toTrajectoryJson(input({ releaseFrame: 190 }));
    expect(json.fit).toBeNull();
    expect(json.speedKmh).toBeNull();
    expect(json.trajectory).toEqual([]);
  });

  it('リリースが無ければ source は none', () => {
    expect(toTrajectoryJson(input({ releaseFrame: null })).release).toEqual({ frame: null, source: 'none' });
  });

  it('JSON にして読み戻せる（NaN や undefined を含まない）', () => {
    const json = toTrajectoryJson(input());
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});

describe('trajectoryJsonFileName', () => {
  it('動画名の拡張子を _trajectory.json に替える', () => {
    expect(trajectoryJsonFileName('IMG_0001.MOV')).toBe('IMG_0001_trajectory.json');
  });
});

describe('推論のしかた', () => {
  it('間引いたか全コマかを JSON に残す', () => {
    expect(toTrajectoryJson(input()).inference).toBe('sampled');
    expect(toTrajectoryJson(input({ inference: 'all' })).inference).toBe('all');
  });
});
