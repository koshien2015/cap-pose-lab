import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';

import type { PoseJsonInput } from '../analysis/types';
import { drawPoseFrame } from './drawPose';

interface Props {
  /** frame_index の順に並べたコマ */
  readonly frames: PoseJsonInput['frames'];
  readonly thumbnails: readonly ImageBitmap[] | null;
  readonly thumbStride: number;
  readonly size: { readonly width: number; readonly height: number } | null;
  readonly position: number;
  readonly onPosition: Dispatch<SetStateAction<number>>;
}

const button = 'min-h-11 rounded-xl border border-current/40 px-3';

/** コマ送り（縮小画像＋骨格、スライダー、±1 コマのボタン）。瞬間の指定画面で共通に使う */
export function FrameScrubber({ frames, thumbnails, thumbStride, size, position, onPosition }: Props) {
  const stride = thumbnails ? Math.max(1, thumbStride) : 1;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = frames[position]?.frame_index ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 縮小画像は間引いてあるので、直前の縮小画像を出し、骨格はそのコマのものを描く
    const thumb = thumbnails ? (thumbnails[Math.min(thumbnails.length - 1, Math.floor(position / stride))] ?? null) : null;
    drawPoseFrame(canvas, frames, position, thumb, size);
  }, [frames, position, thumbnails, stride, size]);

  // 連打しても押した回数だけ進むよう、直前の値から計算する
  const move = (delta: number) => onPosition((p) => Math.min(frames.length - 1, Math.max(0, p + delta)));

  return (
    <>
      <canvas ref={canvasRef} className="w-full rounded-lg" />
      <input
        type="range"
        aria-label="コマ"
        min={0}
        max={Math.max(0, frames.length - 1)}
        step={1}
        value={position}
        onChange={(e) => onPosition(Number(e.target.value))}
        className="h-11 w-full"
      />
      <div className="flex gap-2">
        <button type="button" aria-label="前のコマ" className={`${button} flex-1`} onClick={() => move(-1)}>
          ◀ 前
        </button>
        <span className="flex min-h-11 flex-1 items-center justify-center text-sm tabular-nums">コマ {frame ?? '—'}</span>
        <button type="button" aria-label="次のコマ" className={`${button} flex-1`} onClick={() => move(1)}>
          次 ▶
        </button>
      </div>
    </>
  );
}
