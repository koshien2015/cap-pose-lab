import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Subject } from './analysis/types';
import type { SwingConfig } from './batting/analyzeSwing';
import { friendlyError, type FriendlyError } from './content/errors';
import { poseJsonFileName, toPoseJson } from './export/poseJson';
import { type CapabilityReport, detectCapabilities } from './inference/capabilities';
import type { Person } from './inference/decodePose';
import { estimateSeconds } from './inference/estimate';
import { formatDuration } from './inference/eta';
import { loadManifest, type Manifest, type ModeId, modelUrl } from './inference/manifest';
import { fetchModel, isModelCached, openModelCache, ORT_RUNTIME_MB } from './inference/modelStore';
import type { CompareInput } from './flow/compare';
import { analyzeAll, createSessionWithFallback } from './flow/runAnalysis';
import type { SwingCompareInput } from './flow/swingCompare';
import { isDecoderSupported, loadPickedVideos, type PickedVideo } from './flow/pickVideos';
import { createSession, isOrtRuntimeLoaded } from './inference/ortSession';
import { recommend } from './inference/recommend';
import { analyzeVideo, type PoseRun } from './inference/runPose';
import { loadMeasuredSpeed, saveMeasuredSpeed } from './inference/speedStore';
import { demuxVideo } from './inference/videoSource';
import { findInitialPitcher, trackPitcher } from './tracking/pitcherTracking';
import { CompareFlow } from './ui/CompareFlow';
import { DownloadConsent, type DownloadItem } from './ui/DownloadConsent';
import { downloadJson } from './ui/download';
import { EnvStatus } from './ui/EnvStatus';
import { ErrorPanel } from './ui/ErrorPanel';
import { ExportPanel } from './ui/ExportPanel';
import { ModePicker } from './ui/ModePicker';
import { PitcherConfirm } from './ui/PitcherConfirm';
import { PoseFileLoader } from './ui/PoseFileLoader';
import { type ProgressState, RunProgress } from './ui/RunProgress';
import { StartScreen } from './ui/StartScreen';
import { SwingCompareFlow } from './ui/SwingCompareFlow';
import { TrajectoryFlow } from './trajectory/TrajectoryFlow';
import { VideoPicker } from './ui/VideoPicker';
import { useWakeLock } from './ui/useWakeLock';

type Step = 'start' | 'setup' | 'consent' | 'running' | 'result' | 'load' | 'compare' | 'trajectory';

interface Tracked {
  readonly run: PoseRun;
  readonly track: (Person | null)[];
  readonly selection: 'auto' | 'tap';
}

const stem = (name: string) => name.replace(/\.[^.]+$/, '');

/** 比較の初期設定。投げ腕・打者の向きは指定画面で直してもらう */
function defaultConfig(pitchId: string, fps: number): CompareInput['config'] {
  return { pitchId, label: '', throwingHand: 'right', batterDirection: 'left', fps, footContactFrame: null, releaseFrame: null };
}

/** 打者の比較の初期設定。打ち方は指定画面で直してもらう */
function defaultSwingConfig(swingId: string, fps: number): SwingConfig {
  return { swingId, label: '', bats: 'right', fps, topFrame: null, impactFrame: null };
}

function autoTrack(run: PoseRun): Tracked {
  const anchor = findInitialPitcher(run.frames);
  return { run, track: anchor ? trackPitcher(run.frames, anchor) : run.frames.map(() => null), selection: 'auto' };
}

export function App() {
  const [step, setStep] = useState<Step>('start');
  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [picked, setPicked] = useState<PickedVideo[]>([]);
  const [chosenMode, setMode] = useState<ModeId | null>(null);
  const [consentItems, setConsentItems] = useState<DownloadItem[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ label: '', done: 0, total: 0, eta: '' });
  const [results, setResults] = useState<Tracked[]>([]);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [compareInputs, setCompareInputs] = useState<CompareInput[]>([]);
  const [subject, setSubject] = useState<Subject>('pitcher');
  const [swingInputs, setSwingInputs] = useState<SwingCompareInput[]>([]);
  // 比較から戻る先（解析から来たときは、保存前の結果を失わないよう結果画面に戻す）
  const [compareFrom, setCompareFrom] = useState<'result' | 'start'>('start');
  const abortRef = useRef<AbortController | null>(null);
  const rec = useMemo(() => (report ? recommend(report) : null), [report]);
  // 自分で選ぶまでは、その端末でのおすすめを選んだ状態にする
  const mode = chosenMode ?? rec?.recommendedMode ?? null;
  useWakeLock(step === 'running');

  useEffect(() => {
    detectCapabilities().then(setReport, (e) => setError(friendlyError(e)));
    loadManifest().then(setManifest, (e) => setError(friendlyError(e)));
  }, []);

  const onPick = useCallback(async (files: File[]) => {
    setError(null);
    setPicked([]); // 前の動画を先に手放してから読み込む
    setPicked(await loadPickedVideos(files, demuxVideo, isDecoderSupported));
  }, []);

  const ready = picked.filter((p) => p.video && !p.problem);
  const totalFrames = ready.reduce((s, p) => s + (p.video?.info.frameCount ?? 0), 0);
  const model = manifest?.pose.find((m) => m.id === mode) ?? null;
  const ep = rec?.executionProvider ?? null;

  const estimateSec = (id: ModeId) =>
    ep
      ? estimateSeconds(totalFrames, id, ep, {
          isMobile: report?.isMobile ?? false,
          measuredMsPerFrame: loadMeasuredSpeed(id, ep),
        })
      : 0;

  const prepare = useCallback(async () => {
    if (!model) return;
    const cache = await openModelCache();
    const items: DownloadItem[] = [
      ...(isOrtRuntimeLoaded() ? [] : [{ label: '解析エンジン', sizeMB: ORT_RUNTIME_MB }]),
      ...((await isModelCached(modelUrl(model), cache)) ? [] : [{ label: `解析モデル（${model.label}）`, sizeMB: model.sizeMB }]),
    ];
    setConsentItems(items);
    setStep('consent');
  }, [model]);

  const run = useCallback(async () => {
    if (!model || !ep || !mode) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('running');
    setError(null);
    try {
      const cache = await openModelCache();
      const bytes = await fetchModel(
        modelUrl(model),
        cache,
        // 圧縮配信では全体の大きさが分からないので、manifest のサイズを目安にする
        (got, total) =>
          setProgress({ label: 'モデルをダウンロード中', done: got, total: total || model.sizeMB * 1024 * 1024, eta: '' }),
        fetch,
        controller.signal,
      );
      setProgress({ label: '解析の準備中', done: 0, total: 1, eta: '' });
      const prepared = await createSessionWithFallback(bytes, ep, createSession);
      const { session } = prepared.loaded;
      const note = prepared.fellBack ? '（高速モードが使えなかったため、時間がかかります）' : '';
      try {
        const runs = await analyzeAll(ready, async (p, i) => {
          const r = await analyzeVideo(p.video as NonNullable<PickedVideo['video']>, p.file.name, session, model.imgsz, {
            signal: controller.signal,
            onProgress: (d, t, eta) =>
              setProgress({ label: `解析中（${i + 1}/${ready.length}本目）${note}`, done: d, total: t, eta: formatDuration(eta) }),
          });
          saveMeasuredSpeed(mode, prepared.ep, r.msPerFrame);
          return r;
        });
        const done = runs.map(autoTrack);
        setResults((prev) => {
          prev.forEach((t) => t.run.thumbnails.forEach((b) => b.close())); // 前回分の縮小画像を解放する
          return done;
        });
        setStep('result');
      } finally {
        await session.release();
      }
    } catch (e) {
      setError(friendlyError(e));
      setStep('setup');
    }
  }, [model, ep, mode, ready]);

  const modelLabel = `${model?.weights}@${model?.imgsz}`;
  const poseJsonOf = (t: Tracked) => toPoseJson(t.run, t.track, { modelLabel, selection: t.selection, subject });

  /** 比較の入力を、モードに合わせて作る（打者はトップ・インパクト、投手は足接地・リリースを指定する） */
  const openCompare = (
    items: readonly {
      json: CompareInput['json'];
      thumbnails: readonly ImageBitmap[] | null;
      thumbStride: number;
      size?: CompareInput['size'];
      id: string;
      fps: number;
    }[],
    from: 'result' | 'start',
  ) => {
    if (subject === 'batter') {
      setSwingInputs(items.map(({ id, fps, ...rest }) => ({ ...rest, config: defaultSwingConfig(id, fps) })));
    } else {
      setCompareInputs(items.map(({ id, fps, ...rest }) => ({ ...rest, config: defaultConfig(id, fps) })));
    }
    setCompareFrom(from);
    setStep('compare');
  };

  const startCompareFromResults = () =>
    openCompare(
      results.map((t) => ({
        // 保存した pose.json と同じ経路にし、読み込み時と実行時で結果がずれないようにする
        json: poseJsonOf(t),
        thumbnails: t.run.thumbnails,
        thumbStride: t.run.thumbStride,
        size: { width: t.run.width, height: t.run.height },
        id: stem(t.run.fileName),
        fps: t.run.fps,
      })),
      'result',
    );

  const begin = (next: Subject, to: 'setup' | 'load') => {
    setSubject(next);
    setStep(to);
  };

  const repick = (i: number, frame: number, index: number) =>
    setResults((prev) =>
      prev.map((t, k) => (k === i ? { ...t, track: trackPitcher(t.run.frames, { frame, index }), selection: 'tap' } : t)),
    );

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-bold">投球フォーム解析</h1>
      {error && <ErrorPanel error={error} onRetry={error.retryable && model && ready.length > 0 ? run : undefined} />}
      {step === 'start' && (
        <StartScreen
          onStart={() => begin('pitcher', 'setup')}
          onLoadSaved={() => begin('pitcher', 'load')}
          onBatter={() => begin('batter', 'setup')}
          onLoadSavedBatter={() => begin('batter', 'load')}
          onTrajectory={() => setStep('trajectory')}
        />
      )}
      {step === 'load' && (
        <>
          <PoseFileLoader
            subject={subject}
            onLoad={(files) =>
              openCompare(
                files.map((f) => ({
                  json: f.json,
                  thumbnails: null,
                  thumbStride: 1,
                  id: f.json.meta.pitch_id || stem(f.name),
                  fps: f.json.meta.fps,
                })),
                'start',
              )
            }
          />
          <button type="button" onClick={() => setStep('start')} className="w-full min-h-11 rounded-xl border border-current/40">
            戻る
          </button>
        </>
      )}
      {step === 'compare' &&
        (subject === 'batter' ? (
          <SwingCompareFlow
            inputs={swingInputs}
            exitLabel={compareFrom === 'result' ? '解析結果に戻る' : '最初に戻る'}
            onExit={() => setStep(compareFrom)}
          />
        ) : (
          <CompareFlow
            inputs={compareInputs}
            exitLabel={compareFrom === 'result' ? '解析結果に戻る' : '最初に戻る'}
            onExit={() => setStep(compareFrom)}
          />
        ))}
      {step === 'trajectory' && <TrajectoryFlow report={report} rec={rec} manifest={manifest} onExit={() => setStep('start')} />}
      {step === 'setup' && (
        <>
          <EnvStatus report={report} rec={rec} />
          <VideoPicker picked={picked} onPick={onPick} />
          {manifest && rec && ready.length > 0 && (
            <ModePicker
              models={manifest.pose}
              allowed={rec.allowedModes}
              recommended={rec.recommendedMode}
              estimateSec={estimateSec}
              selected={mode}
              onSelect={setMode}
            />
          )}
          <button
            type="button"
            onClick={prepare}
            disabled={!model || ready.length === 0 || rec?.verdict === 'unsupported'}
            className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white disabled:opacity-40"
          >
            次へ
          </button>
        </>
      )}
      {step === 'consent' && <DownloadConsent items={consentItems} onAccept={run} onCancel={() => setStep('setup')} />}
      {step === 'running' && <RunProgress state={progress} onCancel={() => abortRef.current?.abort()} />}
      {step === 'result' && (
        <>
          {results.map((t, i) => (
            <PitcherConfirm
              key={t.run.fileName}
              run={t.run}
              track={t.track}
              who={subject === 'batter' ? '打者' : '投手'}
              onPick={(f, idx) => repick(i, f, idx)}
            />
          ))}
          <button type="button" onClick={startCompareFromResults} className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white">
            {subject === 'batter' ? 'スイングを比べる（トップとインパクトを指定）' : 'フォームを比べる（足接地とリリースを指定）'}
          </button>
          <ExportPanel
            items={results.map((t) => ({
              fileName: poseJsonFileName(t.run.fileName),
              onSave: () =>
                downloadJson(poseJsonFileName(t.run.fileName), poseJsonOf(t)),
            }))}
          />
        </>
      )}
    </main>
  );
}
