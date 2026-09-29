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
    expect(m.capDetector.imgsz).toBe(1280);
    expect(m.capDetector.preprocess).toBe('enhanced');
    expect(m.capDetector.output).toBe('yolo26-end2end');
    expect(m.capDetector.precision).toBe('fp32');
    expect(m.capDetector.classes[0]).toBe('cap');
  });

  it('出力の形式や精度が未知なら例外にする', () => {
    const badOutput = { ...manifestJson, capDetector: { ...manifestJson.capDetector, output: 'yolov5' } };
    const badPrecision = { ...manifestJson, capDetector: { ...manifestJson.capDetector, precision: 'int8' } };
    expect(() => parseManifest(badOutput)).toThrow();
    expect(() => parseManifest(badPrecision)).toThrow();
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
    expect(modelUrl(m.capDetector)).toBe(`${import.meta.env.BASE_URL}models/cap-detector-y26m-1280.fp32.onnx`);
  });

  it('ブラウザに残った古い一覧を使わず、毎回サーバに更新を確かめる（デプロイ直後にプログラムと食い違わないように）', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetchSpy = async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify(manifestJson));
    };
    await loadManifest(fetchSpy as typeof fetch);
    expect(calls[0][1]?.cache).toBe('no-cache');
  });

  it('取得に失敗したら分かる例外にする', async () => {
    const failing = async () => new Response('', { status: 404 });
    await expect(loadManifest(failing as typeof fetch)).rejects.toThrow('モデル一覧');
  });
});
