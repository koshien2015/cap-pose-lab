/**
 * 解析で使う型。欠損は NaN（Python 版の NaN と同じ扱い）。
 */

/** 解析に渡す姿勢データ（pose.json SCHEMA_VERSION 1。キーポイント名は問わない） */
export interface PoseJsonInput {
  readonly meta: { readonly fps: number; readonly pitch_id: string };
  readonly frames: readonly {
    readonly frame_index: number;
    readonly timestamp_sec: number;
    readonly keypoints: Readonly<Record<string, readonly [number | null, number | null, number]>>;
  }[];
}

/** キーポイントごとの時系列。xy[name][position] = [x, y]（欠損は [NaN, NaN]） */
export interface Tracks {
  readonly frameIndices: readonly number[];
  readonly timestamps: readonly number[];
  readonly fps: number;
  readonly names: readonly string[];
  readonly xy: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  readonly confidence: Readonly<Record<string, readonly number[]>>;
}
