import type { DemuxedVideo } from '../inference/videoSource';

export interface PickedVideo {
  readonly file: File;
  readonly video: DemuxedVideo | null;
  readonly problem: string | null;
}

interface Props {
  readonly picked: readonly PickedVideo[];
  readonly onPick: (files: File[]) => void;
}

export function VideoPicker({ picked, onPick }: Props) {
  return (
    <section className="space-y-3">
      <label className="block w-full min-h-11 cursor-pointer rounded-xl border-2 border-dashed border-current/40 p-4 text-center">
        動画を選ぶ（1本 または 比べたい2本）
        <input
          type="file"
          accept="video/*"
          multiple
          className="sr-only"
          onChange={(e) => onPick(Array.from(e.target.files ?? []).slice(0, 2))}
        />
      </label>
      {picked.map((p) => (
        <div key={p.file.name} className="rounded-xl border border-current/20 p-3 text-sm">
          <p className="font-bold break-all">{p.file.name}</p>
          {p.video && (
            <p>
              {p.video.info.durationSec.toFixed(1)} 秒・{Math.round(p.video.info.fps)} コマ/秒
            </p>
          )}
          {p.problem && <p className="text-red-600">{p.problem}</p>}
        </div>
      ))}
    </section>
  );
}
