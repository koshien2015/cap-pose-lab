import { useEffect, useMemo, useRef, useState } from 'react';

import type { Person } from '../inference/decodePose';
import type { PoseRun } from '../inference/runPose';
import { personAtPoint } from '../tracking/pitcherTracking';

interface Props {
  readonly run: PoseRun;
  readonly track: readonly (Person | null)[];
  readonly onPick: (frame: number, index: number) => void;
  /** 選ぶ人の呼び名 */
  readonly who?: '投手' | '打者';
}

export function PitcherConfirm({ run, track, onPick, who = '投手' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stride = run.thumbStride;
  // 縮小画像のあるコマ（stride おき）だけを表示できる
  const firstFound = Math.max(0, track.findIndex((p, i) => p !== null && i % stride === 0));
  const [frame, setFrame] = useState(firstFound);
  const people = useMemo(() => run.frames[frame] ?? [], [run, frame]);
  const pitcher = track[frame];

  useEffect(() => {
    const canvas = canvasRef.current;
    const thumb = run.thumbnails[Math.floor(frame / stride)];
    const ctx = canvas?.getContext('2d');
    if (!canvas || !thumb || !ctx) return;
    canvas.width = thumb.width;
    canvas.height = thumb.height;
    ctx.drawImage(thumb, 0, 0);
    const scale = thumb.width / run.width;
    people.forEach((p) => {
      ctx.lineWidth = p === pitcher ? 4 : 2;
      ctx.strokeStyle = p === pitcher ? '#06b6d4' : 'rgba(255,255,255,0.7)';
      ctx.strokeRect(p.box[0] * scale, p.box[1] * scale, (p.box[2] - p.box[0]) * scale, (p.box[3] - p.box[1]) * scale);
    });
  }, [frame, people, pitcher, run, stride]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * run.width;
    const y = ((e.clientY - rect.top) / rect.height) * run.height;
    const index = personAtPoint(people, x, y);
    if (index !== null) onPick(frame, index);
  };

  return (
    <section className="space-y-2">
      <p className="font-bold break-all">{run.fileName}</p>
      <p className="text-sm">青い枠が{who}です。違う場合は{who}をタップしてください。</p>
      <canvas ref={canvasRef} onPointerUp={onTap} className="w-full touch-manipulation rounded-xl" />
      <input
        type="range"
        min={0}
        max={Math.max(0, run.frames.length - 1)}
        step={stride}
        value={frame}
        onChange={(e) => setFrame(Number(e.target.value))}
        aria-label="表示するコマ"
        className="h-11 w-full"
      />
      {!pitcher && <p className="text-sm">このコマでは{who}が見つかっていません。コマを動かすか、{who}をタップしてください。</p>}
    </section>
  );
}
