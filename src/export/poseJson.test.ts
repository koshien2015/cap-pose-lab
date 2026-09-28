import { describe, expect, it } from 'vitest';

import type { Person } from '../inference/decodePose';
import { KEYPOINT_NAMES, poseJsonFileName, toPoseJson } from './poseJson';

const person = (x: number): Person => ({
  box: [0, 0, 10, 10],
  score: 0.9,
  keypoints: Array.from({ length: 17 }, (_, k) => [x + k, 100.12345, 0.87654] as const),
});

describe('toPoseJson', () => {
  const run = { fileName: 'a.mov', fps: 60 };
  const json = toPoseJson(run, [person(1), null, person(3)], { modelLabel: 'yolo26s-pose@960', selection: 'auto' });

  it('SCHEMA_VERSION 1 の形で、推論したフレームをすべて記録する', () => {
    expect(json.schema_version).toBe(1);
    expect(json.frames).toHaveLength(3);
    expect(json.meta.pitch_id).toBe('a');
    expect(json.meta.fps).toBe(60);
    expect(json.meta.video_path).toBe('a.mov');
  });

  it('キーポイント名は COCO 17点で pose_export.py と同じ順', () => {
    expect(KEYPOINT_NAMES[0]).toBe('nose');
    expect(KEYPOINT_NAMES[16]).toBe('right_ankle');
    expect(Object.keys(json.frames[0].keypoints)).toEqual([...KEYPOINT_NAMES]);
  });

  it('座標は小数3桁、信頼度は4桁に丸める', () => {
    expect(json.frames[0].keypoints.nose).toEqual([1, 100.123, 0.8765]);
  });

  it('投手がいないフレームは [null, null, 0] で残す（作った値で埋めない）', () => {
    expect(json.frames[1].frame_index).toBe(1);
    expect(json.frames[1].keypoints.nose).toEqual([null, null, 0]);
  });

  it('タイムスタンプはその動画の fps から計算する', () => {
    expect(json.frames[2].timestamp_sec).toBeCloseTo(2 / 60, 6);
    const other = toPoseJson({ fileName: 'b.mp4', fps: 30 }, [person(0), person(0)], { modelLabel: 'm', selection: 'tap' });
    expect(other.meta.fps).toBe(30);
    expect(other.frames[1].timestamp_sec).toBeCloseTo(1 / 30, 6);
  });

  it('投手の選び方をメモに残す（自動選択は確認を促す）', () => {
    expect(json.meta.notes.join()).toContain('最も大きい人物');
    const tapped = toPoseJson(run, [person(1)], { modelLabel: 'm', selection: 'tap' });
    expect(tapped.meta.notes.join()).toContain('タップ');
  });

  it('座標が NaN なら null にする', () => {
    const broken: Person = { ...person(0), keypoints: person(0).keypoints.map(() => [Number.NaN, 1, 0.5] as const) };
    expect(toPoseJson(run, [broken], { modelLabel: 'm', selection: 'auto' }).frames[0].keypoints.nose[0]).toBeNull();
  });
});

describe('poseJsonFileName', () => {
  it('<動画名>_pose.json にする', () => {
    expect(poseJsonFileName('IMG_0001.MOV')).toBe('IMG_0001_pose.json');
    expect(poseJsonFileName('clip')).toBe('clip_pose.json');
  });
});
