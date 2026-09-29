import { useCallback, useEffect, useRef, useState } from 'react';

import { friendlyError, type FriendlyError } from '../content/errors';
import { isDecoderSupported, loadPickedVideos, type PickedVideo } from '../flow/pickVideos';
import type { CapabilityReport } from '../inference/capabilities';
import { estimateDetectSeconds } from '../inference/estimate';
import { formatDuration } from '../inference/eta';
import { type Manifest, modelUrl } from '../inference/manifest';
import { isModelCached, openModelCache, ORT_RUNTIME_MB } from '../inference/modelStore';
import { isOrtRuntimeLoaded } from '../inference/ortSession';
import type { Recommendation } from '../inference/recommend';
import type { DetectRun } from '../inference/runDetect';
import { loadMeasuredSpeed } from '../inference/speedStore';
import { demuxVideo } from '../inference/videoSource';
import { DownloadConsent, type DownloadItem } from '../ui/DownloadConsent';
import { EnvStatus } from '../ui/EnvStatus';
import { ErrorPanel } from '../ui/ErrorPanel';
import { type ProgressState, RunProgress } from '../ui/RunProgress';
import { useWakeLock } from '../ui/useWakeLock';
import { VideoPicker } from '../ui/VideoPicker';
import { trajectoryEnvMessages } from './messages';
import { runTrajectory } from './runTrajectory';
import { TrajectoryResult } from './TrajectoryResult';

type Step = 'setup' | 'consent' | 'running' | 'result';

interface Props {
  readonly report: CapabilityReport | null;
  readonly rec: Recommendation | null;
  readonly manifest: Manifest | null;
  readonly onExit: () => void;
}

const primary = 'w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white disabled:opacity-40';
const secondary = 'w-full min-h-11 rounded-xl border border-current/40';

export function TrajectoryFlow({ report, rec, manifest, onExit }: Props) {
  const [step, setStep] = useState<Step>('setup');
  const [picked, setPicked] = useState<PickedVideo[]>([]);
  const [consentItems, setConsentItems] = useState<DownloadItem[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ label: '', done: 0, total: 0, eta: '' });
  const [run, setRun] = useState<DetectRun | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useWakeLock(step === 'running');
  // 結果を差し替えたとき・画面を離れるときに縮小画像を解放する
  useEffect(() => () => run?.images.forEach((i) => i.image.close()), [run]);

  const detector = manifest?.capDetector ?? null;
  const ep = rec?.executionProvider ?? null;
  const ready = picked.find((p) => p.video && !p.problem) ?? null;
  const frames = ready?.video?.info.frameCount ?? 0;
  const estimate =
    ready && ep
      ? formatDuration(estimateDetectSeconds(frames, ep, { isMobile: report?.isMobile ?? false, measuredMsPerInference: loadMeasuredSpeed('capDetect', ep) }) * 1000)
      : null;

  const onPick = useCallback(async (files: File[]) => {
    setError(null);
    setPicked([]); // 前の動画を先に手放してから読み込む
    setPicked(await loadPickedVideos(files.slice(0, 1), demuxVideo, isDecoderSupported));
  }, []);

  const prepare = useCallback(async () => {
    if (!detector) return;
    const cache = await openModelCache();
    setConsentItems([
      ...(isOrtRuntimeLoaded() ? [] : [{ label: '解析エンジン', sizeMB: ORT_RUNTIME_MB }]),
      ...((await isModelCached(modelUrl(detector), cache)) ? [] : [{ label: 'キャップ検出モデル', sizeMB: detector.sizeMB }]),
    ]);
    setStep('consent');
  }, [detector]);

  const start = useCallback(async () => {
    if (!detector || !ep || !ready?.video) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('running');
    setError(null);
    try {
      const result = await runTrajectory({ video: ready.video, fileName: ready.file.name, detector, ep, signal: controller.signal, onProgress: setProgress });
      setRun(result);
      setStep('result');
    } catch (e) {
      setError(friendlyError(e));
      setStep('setup');
    }
  }, [detector, ep, ready]);

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-bold">投球の軌跡（試験的）</h2>
      {error && <ErrorPanel error={error} onRetry={error.retryable && ready ? start : undefined} />}
      {step === 'setup' && (
        <>
          <EnvStatus report={report} rec={rec} messages={rec ? trajectoryEnvMessages(rec) : undefined} />
          <p className="text-sm">投手の後ろから撮った、1球分の動画（20秒以内）を選んでください。</p>
          <VideoPicker picked={picked} onPick={onPick} max={1} />
          {estimate && <p className="text-sm">解析の目安: {estimate}</p>}
          <button type="button" onClick={prepare} disabled={!detector || !ready || rec?.verdict === 'unsupported'} className={primary}>
            次へ
          </button>
          <button type="button" onClick={onExit} className={secondary}>
            最初に戻る
          </button>
        </>
      )}
      {step === 'consent' && <DownloadConsent items={consentItems} onAccept={start} onCancel={() => setStep('setup')} />}
      {step === 'running' && <RunProgress state={progress} onCancel={() => abortRef.current?.abort()} />}
      {step === 'result' && run && detector && (
        <TrajectoryResult
          run={run}
          model={{ weights: detector.weights, imgsz: detector.imgsz, preprocess: detector.preprocess }}
          onExit={onExit}
        />
      )}
    </section>
  );
}
