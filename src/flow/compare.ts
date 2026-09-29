/**
 * 比較の段取り: pose.json（解析結果 or 保存したファイル）＋指定したイベント → ビューア用データ。
 */

import { z } from 'zod';

import { analyzePitch, type PitchConfig } from '../analysis/analyzePitch';
import { buildViewerPayload, ViewerDataError, type ViewerPayload } from '../analysis/payload';
import type { PoseJsonInput, Subject } from '../analysis/types';

export interface CompareInput {
  readonly json: PoseJsonInput;
  /** 動画から解析した場合の縮小画像（保存したファイルを読み込んだ場合は null） */
  readonly thumbnails: readonly ImageBitmap[] | null;
  readonly thumbStride: number;
  /** 元の映像の大きさ（縮小画像に骨格を重ねるため。無ければ骨格だけ描く） */
  readonly size?: { readonly width: number; readonly height: number } | null;
  readonly config: PitchConfig;
}

export function validateEvents(contact: number | null, release: number | null): string | null {
  if (contact !== null && release !== null && release <= contact) {
    return 'リリースは足接地より後のコマにしてください';
  }
  return null;
}

const KeypointSchema = z.tuple([z.number().nullable(), z.number().nullable(), z.number()]);
const PoseFileSchema = z.object({
  schema_version: z.literal(1),
  meta: z.object({ fps: z.number().positive(), pitch_id: z.string(), subject: z.enum(['pitcher', 'batter']).optional() }).loose(),
  frames: z
    .array(
      z.object({
        frame_index: z.number().int(),
        timestamp_sec: z.number(),
        keypoints: z.record(z.string(), KeypointSchema),
      }),
    )
    .min(1),
});

const NOT_POSE_FILE = '解析結果のファイルではありません（このサイトで保存した「_pose.json」を選んでください）';

/** 期待したモードと違う解析結果を選んだときの案内（キーは期待したモード） */
const WRONG_SUBJECT: Readonly<Record<Subject, string>> = {
  pitcher: '打者の解析結果です（投手のフォームを比べるには、投手の解析結果を選んでください）',
  batter: '投手の解析結果です（打者のスイングを比べるには、打者の解析結果を選んでください）',
};

/** 保存した pose.json を読む。expected を渡すと、印（meta.subject）が違うファイルを断る（印の無い古いファイルは通す） */
export function parsePoseFile(text: string, expected?: Subject): PoseJsonInput {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(NOT_POSE_FILE, { cause: error });
  }
  const parsed = PoseFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error(NOT_POSE_FILE, { cause: parsed.error });
  const subject = parsed.data.meta.subject;
  if (expected && subject && subject !== expected) throw new Error(WRONG_SUBJECT[expected]);
  return parsed.data;
}

export function buildComparison(inputs: readonly CompareInput[]): { payload: ViewerPayload } | { error: string } {
  for (const input of inputs) {
    const problem = validateEvents(input.config.footContactFrame, input.config.releaseFrame);
    if (problem) return { error: `${input.config.pitchId}: ${problem}` };
  }
  try {
    return { payload: buildViewerPayload(inputs.map((i) => analyzePitch(i.json, i.config))) };
  } catch (error) {
    if (error instanceof ViewerDataError) return { error: error.message };
    throw error;
  }
}
