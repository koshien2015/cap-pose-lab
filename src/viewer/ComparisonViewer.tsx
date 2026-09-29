import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ViewerPayload } from '../analysis/payload';
import { COLORS, drawScene, VECTOR_COLORS } from './draw';
import { presentationOf } from './presentation';
import { ReadoutTable } from './ReadoutTable';
import { ShiftControl } from './ShiftControl';
import { SummaryTable } from './SummaryTable';
import { ViewerSettings, type Settings } from './ViewerSettings';
import {
  anchorAvailable, bounds as computeBounds, cursorOfFrame, cursorRange, defaultSync, jointNames, referenceMagnitude, shiftLimit, type ViewState,
} from './viewerMath';

/** 人は縦長なので、縦横比どおりだと画面から溢れる。高さで頭打ちにする */
const MAX_CANVAS_HEIGHT = 520;

function sizeCanvas(canvas: HTMLCanvasElement, aspect: number, maxHeight: number) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 300;
  const height = Math.min(width * aspect, maxHeight);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.height = `${height}px`;
}

export function ComparisonViewer({ payload }: { readonly payload: ViewerPayload }) {
  const progressAvailable = payload.pitches.every((p) => p.normalized);
  const [settings, setSettings] = useState<Settings>(() => ({
    sync: defaultSync(payload),
    vector: 'velocity',
    target: '__arm__',
    layout: 'side',
    arrowScale: 1,
    trail: true,
    speed: 0.5,
  }));
  const presentation = useMemo(() => presentationOf(payload), [payload]);
  const [shift, setShift] = useState(0);
  const baseState: ViewState = useMemo(
    () => ({ sync: settings.sync, vector: settings.vector, target: settings.target, anchorEvent: presentation.anchorEvent }),
    [settings.sync, settings.vector, settings.target, presentation.anchorEvent],
  );
  const state: ViewState = useMemo(() => ({ ...baseState, shift }), [baseState, shift]);
  const shifting = payload.pitches.length === 2 && settings.sync !== 'progress';
  const anchorHint = anchorAvailable(payload)
    ? null
    : `「${presentation.anchorLabel}に合わせる」は、${payload.pitches.length === 2 ? '2本とも' : ''}${presentation.anchorLabel}を指定すると選べます。`;
  const range = useMemo(() => cursorRange(payload, state), [payload, state]);
  const [rawCursor, setCursor] = useState(0);
  const cursor = Math.min(range.max, Math.max(range.min, rawCursor));
  const [playing, setPlaying] = useState(false);
  const joints = useMemo(() => jointNames(payload), [payload]);
  const bounds = useMemo(() => computeBounds(payload), [payload]);
  const reference = useMemo(() => referenceMagnitude(payload, baseState), [payload, baseState]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const groups = useMemo(
    () => (settings.layout === 'overlay' ? [payload.pitches.map((_, i) => i)] : payload.pitches.map((_, i) => [i])),
    [settings.layout, payload],
  );

  const draw = useCallback(() => {
    const aspect = (bounds.maxY - bounds.minY) / (bounds.maxX - bounds.minX);
    const stacked = groups.length > 1 && window.innerHeight > window.innerWidth;
    const maxHeight = stacked ? Math.min(MAX_CANVAS_HEIGHT, window.innerHeight * 0.36) : MAX_CANVAS_HEIGHT;
    groups.forEach((pitchIndexes, i) => {
      const canvas = canvasRefs.current[i];
      if (!canvas) return;
      sizeCanvas(canvas, aspect, maxHeight);
      drawScene(canvas, { payload, pitchIndexes, cursor, state, bounds, arrowScale: settings.arrowScale, reference, joints, trail: settings.trail });
    });
  }, [groups, bounds, payload, cursor, state, settings.arrowScale, settings.trail, reference, joints]);

  useEffect(() => {
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  useEffect(() => {
    if (!playing) return;
    const fps = payload.pitches[0].fps * settings.speed;
    const timer = setInterval(() => {
      setCursor((c) => (c + 1 > range.max ? range.min : Math.max(range.min, c + 1)));
    }, Math.max(20, 1000 / fps));
    return () => clearInterval(timer);
  }, [playing, payload, settings.speed, range]);

  const nudge = useCallback(
    (delta: number) => {
      setPlaying(false);
      // 連打しても押した回数だけ進むよう、直前の値から計算する
      setCursor((c) => Math.min(range.max, Math.max(range.min, Math.min(range.max, Math.max(range.min, c)) + delta)));
    },
    [range],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key === 'ArrowLeft') nudge(-1);
      if (e.key === 'ArrowRight') nudge(1);
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudge]);

  const span = range.max - range.min || 1;
  const ticks = payload.pitches.flatMap((pitch, index) =>
    Object.entries(pitch.events)
      .filter(([name, e]) => name in presentation.eventLabels && e.frame !== null)
      .map(([name, e]) => ({ name, index, at: cursorOfFrame(pitch, e.frame as number, state, payload.normalized_samples, index) }))
      .filter((t): t is { name: string; index: number; at: number } => t.at !== null),
  );

  return (
    <section className="space-y-4 pb-40">
      <ViewerSettings
        settings={settings}
        onChange={setSettings}
        joints={joints}
        progressAvailable={progressAvailable}
        presentation={presentation}
        anchorHint={anchorHint}
      />
      {/* 再生バー（画面下に固定）に入れるとスマホの画面を覆い、コマのスライダーと取り違えやすいので、設定の下に置く */}
      {shifting && (
        <ShiftControl
          value={shift}
          limit={shiftLimit(payload)}
          onChange={(next) => {
            setPlaying(false);
            setShift(next);
          }}
        />
      )}

      <div className={`grid gap-3 ${settings.layout === 'side' && groups.length > 1 ? 'landscape:grid-cols-2 md:grid-cols-2' : ''}`}>
        {groups.map((pitchIndexes, i) => (
          <figure key={pitchIndexes.join('-')} className="m-0">
            <figcaption className="mb-1 text-sm">
              {pitchIndexes.map((pi) => (
                <span key={pi} className="mr-3">
                  <span style={{ color: COLORS[pi] }}>■ {payload.pitches[pi].display_name}</span>
                  {settings.vector !== 'none' && <span style={{ color: VECTOR_COLORS[pi] }}> ➜</span>}
                </span>
              ))}
            </figcaption>
            <canvas
              ref={(el) => {
                canvasRefs.current[i] = el;
              }}
              className="w-full rounded-lg border border-current/20 bg-[#0A1013]"
            />
          </figure>
        ))}
      </div>

      <SummaryTable payload={payload} />

      <ReadoutTable payload={payload} cursor={cursor} state={state} joints={joints} />

      <details className="rounded-xl border border-current/20 p-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-bold">読み方</summary>
        <div className="space-y-2">
          {presentation.readingNotes ? (
            presentation.readingNotes.map((note) => <p key={note}>{note}</p>)
          ) : (
            <p>座標は身体の大きさ（両肩の幅）を 1 とした値です。原点は足接地のときの腰の中心で、打者の方向を右、上を上にそろえています。</p>
          )}
          <p>
            <span style={{ color: VECTOR_COLORS[0] }}>➜ 矢印</span>は骨格と別の色で描いています。
            <strong>矢印は力そのものではありません。</strong>
            速度は続く2コマの動き、加速度はその変化（3コマ）で、向きが力の向きに当たります。重さが分からないので、大きさは相対的な値です。
          </p>
          {!presentation.readingNotes && (
            <p>2D の映像から見た動きなので、奥行き方向は含みません。2球の差は観測された違いで、原因を示すものではありません。</p>
          )}
        </div>
      </details>

      <div className="fixed inset-x-0 bottom-0 border-t border-current/20 bg-[Canvas] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl space-y-1">
          <input
            type="range"
            aria-label="コマ"
            min={range.min}
            max={range.max}
            step={1}
            value={cursor}
            onChange={(e) => {
              setPlaying(false);
              setCursor(Number(e.target.value));
            }}
            className="h-11 w-full"
          />
          <div className="relative h-5 text-[10px]">
            {ticks.map((t) => (
              <span
                key={`${t.index}-${t.name}`}
                className="absolute whitespace-nowrap"
                style={{
                  left: `${((t.at - range.min) / span) * 100}%`,
                  // 端の目盛りの文字が画面からはみ出さないよう、左右で寄せ方を変える
                  transform: `translateX(${t.at - range.min < span * 0.15 ? '0' : t.at - range.min > span * 0.85 ? '-100%' : '-50%'})`,
                  color: COLORS[t.index],
                }}
              >
                │{presentation.eventLabels[t.name]}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" aria-label="前のコマ" onClick={() => nudge(-1)} className="min-h-11 flex-1 rounded-xl border border-current/40">
              ◀
            </button>
            <button type="button" onClick={() => setPlaying((p) => !p)} className="min-h-11 flex-[2] rounded-xl bg-cyan-600 font-bold text-white">
              {playing ? '■ 停止' : '▶ 再生'}
            </button>
            <button type="button" aria-label="次のコマ" onClick={() => nudge(1)} className="min-h-11 flex-1 rounded-xl border border-current/40">
              ▶
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
