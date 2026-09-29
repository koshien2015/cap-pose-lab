/**
 * モデル一覧（public/models/manifest.json）の検証と読み込み。
 * 重みの差し替えは manifest の書き換えだけで済むようにし、コードにモデル名を書かない。
 */

import { z } from 'zod';

const MODE_IDS = ['fast', 'standard', 'detailed'] as const;
export type ModeId = (typeof MODE_IDS)[number];

const PoseModelSchema = z.object({
  id: z.enum(MODE_IDS),
  label: z.string().min(1),
  description: z.string().min(1),
  weights: z.string().min(1),
  file: z.string().min(1),
  imgsz: z.number().int().positive(),
  sizeMB: z.number().positive(),
  output: z.literal('yolo26-end2end'),
});

/** 名前で引くクラス。番号はモデルごとに違いうるのでコードに書かない */
export const REQUIRED_DETECTOR_CLASSES = ['cap', 'pitcher_motion', 'pitcher_release'] as const;

const CapDetectorSchema = z
  .object({
    version: z.string().min(1),
    weights: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    source: z.url(),
    file: z.string().min(1),
    imgsz: z.number().int().positive(),
    sizeMB: z.number().positive(),
    /** fp16 は書き出し後に変換する（入出力は float32 のまま） */
    precision: z.enum(['fp32', 'fp16']),
    preprocess: z.enum(['raw', 'enhanced']),
    /** yolov8-raw: [1, 4+nc, N]（NMS が要る）/ yolo26-end2end: [1, 300, 6]（NMS 不要） */
    output: z.enum(['yolov8-raw', 'yolo26-end2end']),
    classes: z.array(z.string().min(1)).min(1),
    license: z.string().min(1),
  })
  .refine((d) => REQUIRED_DETECTOR_CLASSES.every((c) => d.classes.includes(c)), {
    message: `キャップ検出モデルのクラスに ${REQUIRED_DETECTOR_CLASSES.join(' / ')} が必要です`,
  });

const ManifestSchema = z.object({
  version: z.literal(1),
  pose: z.array(PoseModelSchema).min(1),
  capDetector: CapDetectorSchema,
});

export type PoseModel = z.infer<typeof PoseModelSchema>;
export type CapDetector = z.infer<typeof CapDetectorSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export function parseManifest(json: unknown): Manifest {
  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`モデル一覧の形式が不正です: ${parsed.error.message}`);
  }
  return { ...parsed.data, pose: [...parsed.data.pose].sort((a, b) => a.sizeMB - b.sizeMB) };
}

export function modelUrl(model: { readonly file: string }): string {
  return `${import.meta.env.BASE_URL}models/${model.file}`;
}

export async function loadManifest(fetchImpl: typeof fetch = fetch): Promise<Manifest> {
  // GitHub Pages は 10 分キャッシュさせる。デプロイ直後に古い一覧と新しいプログラムが食い違わないよう、
  // 毎回サーバに更新を確かめる（変わっていなければ 304 で済む）
  const res = await fetchImpl(`${import.meta.env.BASE_URL}models/manifest.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`モデル一覧を取得できません（HTTP ${res.status}）`);
  return parseManifest(await res.json());
}
