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

const ManifestSchema = z.object({
  version: z.literal(1),
  pose: z.array(PoseModelSchema).min(1),
});

export type PoseModel = z.infer<typeof PoseModelSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export function parseManifest(json: unknown): Manifest {
  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`モデル一覧の形式が不正です: ${parsed.error.message}`);
  }
  return { ...parsed.data, pose: [...parsed.data.pose].sort((a, b) => a.sizeMB - b.sizeMB) };
}

export function modelUrl(model: PoseModel): string {
  return `${import.meta.env.BASE_URL}models/${model.file}`;
}

export async function loadManifest(fetchImpl: typeof fetch = fetch): Promise<Manifest> {
  const res = await fetchImpl(`${import.meta.env.BASE_URL}models/manifest.json`);
  if (!res.ok) throw new Error(`モデル一覧を取得できません（HTTP ${res.status}）`);
  return parseManifest(await res.json());
}
