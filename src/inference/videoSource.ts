/**
 * 動画ファイル → VideoFrame の取り出し（mp4box で分離、WebCodecs でデコード）。
 * `<video>` のシークはフレーム単位で正確でないため使わない。
 */

import { createFile, DataStream, Endianness, MP4BoxBuffer, type Sample } from 'mp4box';

export interface VideoInfo {
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  /** 表示時の回転（iPhone の縦動画は 90 など）。フレーム描画時に適用する */
  readonly rotation: 0 | 90 | 180 | 270;
  readonly fps: number;
  readonly frameCount: number;
  readonly durationSec: number;
  readonly fileSizeMB: number;
}

export interface DemuxedVideo {
  readonly info: VideoInfo;
  readonly config: VideoDecoderConfig;
  readonly chunks: readonly EncodedVideoChunk[];
}

type DescriptionBox = { write(stream: DataStream): void };
type SampleEntryLike = Partial<Record<'avcC' | 'hvcC' | 'vpcC' | 'av1C', DescriptionBox>>;

function codecDescription(entries: readonly SampleEntryLike[]): Uint8Array | undefined {
  for (const entry of entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (box) {
      const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer as ArrayBuffer, 8); // box ヘッダ 8 バイトを除く
    }
  }
  return undefined;
}

export function rotationFromMatrix(matrix: ArrayLike<number>): VideoInfo['rotation'] {
  const degrees = Math.round((Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI);
  const normalized = ((degrees % 360) + 360) % 360;
  return ([0, 90, 180, 270] as const).find((r) => r === normalized) ?? 0;
}

function toChunk(s: Sample): EncodedVideoChunk {
  if (!s.data) throw new Error(`サンプル ${s.number} にデータがありません`);
  return new EncodedVideoChunk({
    type: s.is_sync ? 'key' : 'delta',
    timestamp: (1e6 * s.cts) / s.timescale,
    duration: (1e6 * s.duration) / s.timescale,
    data: s.data,
  });
}

export async function demuxVideo(file: File): Promise<DemuxedVideo> {
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const mp4 = createFile();
    const samples: Sample[] = [];
    let trackId = -1;
    mp4.onError = (module, message) => reject(new Error(`動画の解析に失敗しました（${module}）: ${message}`));
    mp4.onReady = (movie) => {
      const track = movie.videoTracks[0];
      if (!track) {
        reject(new Error('映像トラックがありません'));
        return;
      }
      trackId = track.id;
      mp4.setExtractionOptions(track.id, undefined, { nbSamples: Infinity });
      mp4.start();
    };
    mp4.onSamples = (_id, _user, batch) => {
      samples.push(...batch);
    };
    mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, 0));
    mp4.flush();

    if (trackId < 0) {
      reject(new Error('MP4/MOV として読み込めませんでした'));
      return;
    }
    const track = mp4.getTrackById(trackId);
    const movieTrack = mp4.getInfo().videoTracks.find((t) => t.id === trackId);
    if (!movieTrack) {
      reject(new Error('映像トラック情報を取得できません'));
      return;
    }
    const entries = track.mdia.minf.stbl.stsd.entries as unknown as SampleEntryLike[];
    const durationSec = movieTrack.duration / movieTrack.timescale;
    resolve({
      info: {
        codec: movieTrack.codec,
        codedWidth: movieTrack.video?.width ?? 0,
        codedHeight: movieTrack.video?.height ?? 0,
        rotation: rotationFromMatrix(movieTrack.matrix),
        fps: durationSec > 0 ? movieTrack.nb_samples / durationSec : 0,
        frameCount: samples.length,
        durationSec,
        fileSizeMB: file.size / (1024 * 1024),
      },
      config: {
        codec: movieTrack.codec,
        codedWidth: movieTrack.video?.width,
        codedHeight: movieTrack.video?.height,
        description: codecDescription(entries),
      },
      chunks: samples.map(toChunk),
    });
  });
}

const MAX_IN_FLIGHT = 16;
const STALL_MS = 200;

/**
 * VideoFrame を1枚ずつ返す。受け取った側が frame.close() すること。
 * デコーダに投入する量を絞り、全フレームをメモリに溜めない（スマホで落ちないため）。
 */
export async function* decodeFrames(video: DemuxedVideo, limit?: number): AsyncGenerator<VideoFrame> {
  const chunks = limit ? video.chunks.slice(0, chunksNeededFor(video.chunks, limit)) : video.chunks;
  const ready: VideoFrame[] = [];
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };
  const decoder = new VideoDecoder({
    output: (frame) => {
      ready.push(frame);
      notify();
    },
    error: (e) => {
      failure = new Error(`デコードに失敗しました: ${e.message}`);
      notify();
    },
  });
  decoder.configure(video.config);

  let fed = 0;
  let emitted = 0;
  let flushed = false;
  let flushing: Promise<void> | null = null;
  try {
    while (true) {
      if (failure) throw failure;
      while (fed < chunks.length && fed - emitted < MAX_IN_FLIGHT) {
        decoder.decode(chunks[fed]);
        fed += 1;
      }
      if (fed === chunks.length && !flushing) {
        flushing = decoder.flush().then(() => {
          flushed = true;
          notify();
        });
      }
      const frame = ready.shift();
      if (frame) {
        emitted += 1;
        yield frame;
        continue;
      }
      if (flushed) break;
      const stalled = await waitFor((resolve) => (wake = resolve), STALL_MS);
      // 出力が来ないままなら、デコーダがさらに入力を必要としている（B フレームの並べ替え等）
      if (stalled && fed < chunks.length) {
        decoder.decode(chunks[fed]);
        fed += 1;
      }
    }
  } finally {
    ready.forEach((f) => f.close());
    if (decoder.state !== 'closed') decoder.close();
  }
}

/** limit 枚ぶんに加え、並べ替えで必要になる後続を少し足す（出力が limit に届くように）。 */
function chunksNeededFor(chunks: readonly EncodedVideoChunk[], limit: number): number {
  return Math.min(chunks.length, limit + 8);
}

function waitFor(register: (resolve: () => void) => void, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), ms);
    register(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
