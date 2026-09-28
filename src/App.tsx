import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { friendlyError, type FriendlyError } from './content/errors';
import { poseJsonFileName, toPoseJson } from './export/poseJson';
import { type CapabilityReport, detectCapabilities } from './inference/capabilities';
import type { Person } from './inference/decodePose';
import { estimateSeconds } from './inference/estimate';
import { formatDuration } from './inference/eta';
import { loadManifest, type Manifest, type ModeId, modelUrl } from './inference/manifest';
import { fetchModel, isModelCached, openModelCache, ORT_RUNTIME_MB } from './inference/modelStore';
import { analyzeAll, createSessionWithFallback } from './flow/runAnalysis';
import { isDecoderSupported, loadPickedVideos, type PickedVideo } from './flow/pickVideos';
import { createSession, isOrtRuntimeLoaded } from './inference/ortSession';
import { recommend } from './inference/recommend';
import { analyzeVideo, type PoseRun } from './inference/runPose';
import { loadMeasuredSpeed, saveMeasuredSpeed } from './inference/speedStore';
import { demuxVideo } from './inference/videoSource';
import { findInitialPitcher, trackPitcher } from './tracking/pitcherTracking';
import { DownloadConsent, type DownloadItem } from './ui/DownloadConsent';
import { downloadJson } from './ui/download';
import { EnvStatus } from './ui/EnvStatus';
import { ExportPanel } from './ui/ExportPanel';
import { ModePicker } from './ui/ModePicker';
import { PitcherConfirm } from './ui/PitcherConfirm';
import { type ProgressState, RunProgress } from './ui/RunProgress';
import { StartScreen } from './ui/StartScreen';
import { VideoPicker } from './ui/VideoPicker';
import { useWakeLock } from './ui/useWakeLock';

type Step = 'start' | 'setup' | 'consent' | 'running' | 'result';

interface Tracked {
  readonly run: PoseRun;
  readonly track: (Person | null)[];
  readonly selection: 'auto' | 'tap';
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

  const repick = (i: number, frame: number, index: number) =>
    setResults((prev) =>
      prev.map((t, k) => (k === i ? { ...t, track: trackPitcher(t.run.frames, { frame, index }), selection: 'tap' } : t)),
    );

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-bold">投球フォーム解析</h1>
      {error && (
        <section role="alert" className="space-y-1 rounded-xl border-2 border-red-500 p-3 text-sm">
          <p className="font-bold">{error.title}</p>
          <p>{error.action}</p>
          {error.retryable && model && ready.length > 0 && (
            <button type="button" onClick={run} className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white">
              もう一度試す
            </button>
          )}
          <details>
            <summary className="min-h-11 cursor-pointer py-2">詳しい情報</summary>
            <pre className="whitespace-pre-wrap break-all text-xs">{error.detail}</pre>
          </details>
        </section>
      )}
      {step === 'start' && <StartScreen onStart={() => setStep('setup')} />}
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
            <PitcherConfirm key={t.run.fileName} run={t.run} track={t.track} onPick={(f, idx) => repick(i, f, idx)} />
          ))}
          <ExportPanel
            items={results.map((t) => ({
              fileName: poseJsonFileName(t.run.fileName),
              onSave: () =>
                downloadJson(
                  poseJsonFileName(t.run.fileName),
                  toPoseJson(t.run, t.track, { modelLabel: `${model?.weights}@${model?.imgsz}`, selection: t.selection }),
                ),
            }))}
          />
        </>
      )}
    </main>
  );
}
