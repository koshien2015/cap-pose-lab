import { useEffect, useMemo, useRef, useState } from 'react';

import { analyzeThrow, type ThrowAnalysis } from '../capDetect/analyzeThrow';
import { findReleaseCandidate } from '../capDetect/release';
import { type ReleaseSource, toTrajectoryJson, trajectoryJsonFileName } from '../capDetect/trajectoryJson';
import type { DetectRun } from '../inference/runDetect';
import { downloadJson } from '../ui/download';
import { drawTrajectoryFrame } from './drawTrajectory';
import { describeProblem, formatSpeed, NO_RELEASE_NOTE, SPEED_NOTE, SUSPICIOUS_NOTE } from './messages';

export interface ResultModel {
  readonly weights: string;
  readonly imgsz: number;
  readonly preprocess: 'raw' | 'enhanced';
}

interface Release {
  readonly frame: number | null;
  readonly source: ReleaseSource;
}

const button = 'min-h-11 rounded-xl border border-current/40 px-3';

/** 最初に見せるコマ: 最後にキャップが写っていたコマ（無ければ最後のコマ） */
function initialPosition(run: DetectRun): number {
  const lastCap = [...run.records].sort((a, b) => b.frame - a.frame).find((r) => r.cap !== null)?.frame;
  const i = run.images.findIndex((im) => im.frame === lastCap);
  return i >= 0 ? i : Math.max(0, run.images.length - 1);
}

function ReleaseControls({ auto, release, currentFrame, onChange }: {
  readonly auto: number | null;
  readonly release: Release;
  readonly currentFrame: number | null;
  readonly onChange: (r: Release) => void;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p>{release.frame === null ? NO_RELEASE_NOTE : `リリース: コマ ${release.frame}（${release.source === 'auto' ? '自動' : '指定'}）`}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={button} disabled={currentFrame === null}
          onClick={() => currentFrame !== null && onChange({ frame: currentFrame, source: 'manual' })}>
          このコマをリリースにする
        </button>
        {auto !== null && release.source === 'manual' && (
          <button type="button" className={button} onClick={() => onChange({ frame: auto, source: 'auto' })}>
            自動の候補に戻す
          </button>
        )}
      </div>
    </div>
  );
}

function ResultCard({ analysis: a }: { readonly analysis: ThrowAnalysis }) {
  if (a.problem) {
    const text = describeProblem(a.problem);
    return (
      <section role="alert" className="space-y-1 rounded-xl border-2 border-amber-500 p-3 text-sm">
        <p className="font-bold">{text.title}</p>
        <ul className="list-disc pl-5">
          {text.actions.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </section>
    );
  }
  return (
    <section className="space-y-1 rounded-xl border border-current/20 p-3">
      <p className="text-lg font-bold">平均球速 {a.speedKmh === null ? '—' : formatSpeed(a.speedKmh)}（推定値・試験的）</p>
      <p className="text-sm">{SPEED_NOTE}</p>
      {a.speedSuspicious && <p className="text-sm text-amber-600">{SUSPICIOUS_NOTE}</p>}
    </section>
  );
}

/** 検出した点は誤検出かどうかで分けず、すべて並べる（見た人が判断できるように） */
function DetectionTable({ analysis: a }: { readonly analysis: ThrowAnalysis }) {
  return (
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr>
          <th className="text-left">コマ</th>
          <th className="text-right">横 (px)</th>
          <th className="text-right">縦 (px)</th>
          <th className="text-right">信頼度</th>
        </tr>
      </thead>
      <tbody>
        {a.detections.map((d) => (
          <tr key={d.frame}>
            <td>{d.frame}</td>
            <td className="text-right">{d.x.toFixed(1)}</td>
            <td className="text-right">{d.y.toFixed(1)}</td>
            <td className="text-right">{d.conf.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Details({ run, analysis: a }: { readonly run: DetectRun; readonly analysis: ThrowAnalysis }) {
  const rows: [string, string][] = [
    ['キャップを検出したコマ', String(a.detections.length)],
    ['推論したコマ', `${run.records.length} / ${run.frameCount}`],
    ['1コマの推論時間', `${Math.round(run.msPerInference)} ms`],
  ];
  return (
    <details className="space-y-2 text-sm">
      <summary className="min-h-11 cursor-pointer py-2">詳しい情報</summary>
      <dl className="grid grid-cols-2 gap-1">
        {rows.map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
      </dl>
      <DetectionTable analysis={a} />
    </details>
  );
}

export function TrajectoryResult({ run, model, onExit }: { readonly run: DetectRun; readonly model: ResultModel; readonly onExit: () => void }) {
  const auto = useMemo(() => findReleaseCandidate(run.records), [run]);
  const [release, setRelease] = useState<Release>({ frame: auto, source: auto === null ? 'none' : 'auto' });
  const [position, setPosition] = useState(() => initialPosition(run));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysis = useMemo(
    () => analyzeThrow({ records: run.records, fps: run.fps, frameHeight: run.height, releaseFrame: release.frame }),
    [run, release.frame],
  );
  const current = run.images[position] ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !current) return;
    drawTrajectoryFrame(canvas, current.image, { scale: current.image.width / run.width, analysis, currentFrame: current.frame });
  }, [analysis, current, run.width]);

  const move = (delta: number) => setPosition((p) => Math.min(run.images.length - 1, Math.max(0, p + delta)));
  const save = () =>
    downloadJson(
      trajectoryJsonFileName(run.fileName),
      toTrajectoryJson({
        fileName: run.fileName, fps: run.fps, width: run.width, height: run.height, frameCount: run.frameCount,
        model, releaseFrame: release.frame, releaseSource: release.source, records: run.records, analysis,
      }),
    );

  return (
    <section className="space-y-4">
      <canvas ref={canvasRef} className="w-full rounded-lg bg-black" />
      <input type="range" aria-label="コマ" min={0} max={Math.max(0, run.images.length - 1)} step={1} value={position}
        onChange={(e) => setPosition(Number(e.target.value))} className="h-11 w-full" />
      <div className="flex gap-2">
        <button type="button" aria-label="前のコマ" className={`${button} flex-1`} onClick={() => move(-1)}>◀ 前</button>
        <span className="flex min-h-11 flex-1 items-center justify-center text-sm tabular-nums">コマ {current?.frame ?? '—'}</span>
        <button type="button" aria-label="次のコマ" className={`${button} flex-1`} onClick={() => move(1)}>次 ▶</button>
      </div>
      <ReleaseControls auto={auto} release={release} currentFrame={current?.frame ?? null} onChange={setRelease} />
      <ResultCard analysis={analysis} />
      <Details run={run} analysis={analysis} />
      <button type="button" onClick={save} className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white">結果を保存</button>
      <button type="button" onClick={onExit} className="w-full min-h-11 rounded-xl border border-current/40">最初に戻る</button>
    </section>
  );
}
