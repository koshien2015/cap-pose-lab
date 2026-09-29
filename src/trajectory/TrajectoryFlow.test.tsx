import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../flow/pickVideos', async (orig) => ({
  ...(await orig<typeof import('../flow/pickVideos')>()),
  loadPickedVideos: vi.fn(async (files: File[]) =>
    files.map((file) => ({ file, video: { info: { frameCount: 600, durationSec: 10, fps: 60 } }, problem: null })),
  ),
}));
vi.mock('../inference/modelStore', async (orig) => ({
  ...(await orig<typeof import('../inference/modelStore')>()),
  openModelCache: async () => null,
  isModelCached: async () => false,
}));

import manifestJson from '../../public/models/manifest.json';
import type { CapabilityReport } from '../inference/capabilities';
import { parseManifest } from '../inference/manifest';
import type { Recommendation } from '../inference/recommend';
import { TrajectoryFlow } from './TrajectoryFlow';

const manifest = parseManifest(manifestJson);
const report = { isMobile: false } as unknown as CapabilityReport;
const limited: Recommendation = {
  verdict: 'limited',
  executionProvider: 'wasm',
  allowedModes: ['fast'],
  recommendedMode: 'fast',
  messages: ['この端末は高速モードに対応していないため、「はやい」だけを選べます。'],
};

describe('TrajectoryFlow', () => {
  it('軌跡の解析向けの環境の文言を出し、動画を1本選ぶまで進めない', () => {
    render(<TrajectoryFlow report={report} rec={limited} manifest={manifest} onExit={() => undefined} />);
    expect(screen.getByText(/解析に時間がかかります/)).toBeInTheDocument();
    expect(screen.queryByText(/「はやい」だけ/)).toBeNull();
    expect(screen.getByText('動画を選ぶ（1本）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('動画を選ぶと目安の時間が出て、ダウンロードの確認に進める', async () => {
    render(<TrajectoryFlow report={report} rec={limited} manifest={manifest} onExit={() => undefined} />);
    await userEvent.upload(screen.getByLabelText('動画を選ぶ（1本）'), new File(['x'], 'clip.mp4', { type: 'video/mp4' }));
    expect(await screen.findByText(/解析の目安: 約/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(await screen.findByText(/キャップ検出モデル（約 \d+ MB）/)).toBeInTheDocument();
  });

  it('「最初に戻る」で抜けられる', async () => {
    const onExit = vi.fn();
    render(<TrajectoryFlow report={report} rec={limited} manifest={manifest} onExit={onExit} />);
    await userEvent.click(screen.getByRole('button', { name: '最初に戻る' }));
    expect(onExit).toHaveBeenCalled();
  });
});
