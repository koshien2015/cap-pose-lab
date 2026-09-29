import { createSessionWithFallback } from '../flow/runAnalysis';
import { formatDuration } from '../inference/eta';
import { type CapDetector, modelUrl } from '../inference/manifest';
import { fetchModel, openModelCache } from '../inference/modelStore';
import { createSession } from '../inference/ortSession';
import type { ExecutionProvider } from '../inference/recommend';
import { analyzeDetectVideo, type DetectRun } from '../inference/runDetect';
import { saveMeasuredSpeed } from '../inference/speedStore';
import type { DemuxedVideo } from '../inference/videoSource';
import type { ProgressState } from '../ui/RunProgress';

export interface TrajectoryRunInput {
  readonly video: DemuxedVideo;
  readonly fileName: string;
  readonly detector: CapDetector;
  readonly ep: ExecutionProvider;
  readonly signal: AbortSignal;
  readonly onProgress: (p: ProgressState) => void;
}

export async function runTrajectory({ video, fileName, detector, ep, signal, onProgress }: TrajectoryRunInput): Promise<DetectRun> {
  const bytes = await fetchModel(
    modelUrl(detector),
    await openModelCache(),
    // 圧縮配信では全体の大きさが分からないので、manifest のサイズを目安にする
    (got, total) => onProgress({ label: 'モデルをダウンロード中', done: got, total: total || detector.sizeMB * 1024 * 1024, eta: '' }),
    fetch,
    signal,
  );
  onProgress({ label: '解析の準備中', done: 0, total: 1, eta: '' });
  const prepared = await createSessionWithFallback(bytes, ep, createSession);
  const note = prepared.fellBack ? '（高速モードが使えなかったため、時間がかかります）' : '';
  try {
    const run = await analyzeDetectVideo(video, fileName, prepared.loaded.session, detector, {
      signal,
      onProgress: (d, t, eta) => onProgress({ label: `キャップを探しています${note}`, done: d, total: t, eta: formatDuration(eta) }),
    });
    saveMeasuredSpeed('capDetect', prepared.ep, run.msPerInference);
    return run;
  } finally {
    await prepared.loaded.session.release();
  }
}
