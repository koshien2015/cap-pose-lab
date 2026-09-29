import { describe, expect, it } from 'vitest';

import manifestJson from '../../public/models/manifest.json';
import { loadManifest, modelUrl, parseManifest } from './manifest';

describe('parseManifest', () => {
  it('同梱の manifest を読めて、軽い順（sizeMB 昇順）に並ぶ', () => {
    const m = parseManifest(manifestJson);
    expect(m.pose.map((p) => p.id)).toEqual(['fast', 'standard', 'detailed']);
  });

  it('必須項目が欠けていれば例外にする', () => {
    expect(() => parseManifest({ version: 1, pose: [{ id: 'fast' }] })).toThrow();
  });

  it('未知のモード ID は例外にする', () => {
    const bad = { version: 1, pose: [{ ...manifestJson.pose[0], id: 'turbo' }] };
    expect(() => parseManifest(bad)).toThrow();
  });

  it('pose が空なら例外にする', () => {
    expect(() => parseManifest({ version: 1, pose: [] })).toThrow();
  });

  it('キャップ検出モデルを読める', () => {
    const m = parseManifest(manifestJson);
    expect(m.capDetector.imgsz).toBe(640);
    expect(m.capDetector.preprocess).toBe('raw');
    expect(m.capDetector.classes[0]).toBe('cap');
  });

  it('キャップ検出モデルに必要なクラスが無ければ例外にする', () => {
    const bad = { ...manifestJson, capDetector: { ...manifestJson.capDetector, classes: ['cap', 'umpire'] } };
    expect(() => parseManifest(bad)).toThrow('pitcher_motion');
  });

  it('前処理の種類が未知なら例外にする', () => {
    const bad = { ...manifestJson, capDetector: { ...manifestJson.capDetector, preprocess: 'motion3ch' } };
    expect(() => parseManifest(bad)).toThrow();
  });
});

describe('modelUrl / loadManifest', () => {
  it('BASE_URL 配下の models/ を指す', () => {
    const m = parseManifest(manifestJson);
    expect(modelUrl(m.pose[0])).toBe(`${import.meta.env.BASE_URL}models/yolo26n-pose.fp32.onnx`);
  });

  it('キャップ検出モデルも BASE_URL 配下の models/ を指す', () => {
    const m = parseManifest(manifestJson);
    expect(modelUrl(m.capDetector)).toBe(`${import.meta.env.BASE_URL}models/cap-detector-20250510.fp16.onnx`);
  });

  it('取得に失敗したら分かる例外にする', async () => {
    const failing = async () => new Response('', { status: 404 });
    await expect(loadManifest(failing as typeof fetch)).rejects.toThrow('モデル一覧');
  });
});
