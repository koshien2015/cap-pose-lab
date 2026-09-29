import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../ui/download', () => ({ downloadJson: vi.fn() }));

import type { FrameRecord } from '../capDetect/records';
import { SYNTH_FPS, SYNTH_HEIGHT, SYNTH_WIDTH, syntheticThrow } from '../capDetect/syntheticThrow';
import type { DetectRun } from '../inference/runDetect';
import { downloadJson } from '../ui/download';
import { TrajectoryResult } from './TrajectoryResult';

const fakeImage = () => ({ width: 320, height: 180, close: vi.fn() }) as unknown as ImageBitmap;

/** 全コマ推論した合成投球（画像の位置 = コマ番号） */
function makeRun(records: FrameRecord[] = syntheticThrow()): DetectRun {
  return {
    fileName: 'clip.mov',
    fps: SYNTH_FPS,
    width: SYNTH_WIDTH,
    height: SYNTH_HEIGHT,
    frameCount: 200,
    records,
    images: records.map((r) => ({ frame: r.frame, image: fakeImage() })),
    msPerInference: 40,
  };
}

const model = { weights: 'yolo8m_20250510.pt', imgsz: 640, preprocess: 'raw' as const };

describe('TrajectoryResult', () => {
  it('平均球速を推定値として出し、自動のリリースと、最後にキャップが写ったコマを示す', () => {
    render(<TrajectoryResult run={makeRun()} model={model} onExit={() => undefined} />);
    expect(screen.getByText(/平均球速 約 87 km\/h（推定値・試験的）/)).toBeInTheDocument();
    expect(screen.getByText('リリース: コマ 100（自動）')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'コマ' })).toHaveValue('124');
  });

  it('リリースを最後の検出より後にすると案内を出し、自動の候補に戻せる', async () => {
    render(<TrajectoryResult run={makeRun()} model={model} onExit={() => undefined} />);
    fireEvent.change(screen.getByRole('slider', { name: 'コマ' }), { target: { value: '150' } });
    await userEvent.click(screen.getByRole('button', { name: 'このコマをリリースにする' }));
    expect(screen.getByText('リリース: コマ 150（指定）')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('キャップの軌跡を見つけられませんでした');
    expect(screen.getByRole('alert')).toHaveTextContent('リリースより後');
    await userEvent.click(screen.getByRole('button', { name: '自動の候補に戻す' }));
    expect(screen.getByText(/約 87 km\/h/)).toBeInTheDocument();
  });

  it('キャップもリリースも見つからなければ、撮り方とコマ送りでの指定を案内する', () => {
    const records = syntheticThrow({ flightFrames: 0 }).map((r) => ({ ...r, pitcher: null }));
    render(<TrajectoryResult run={makeRun(records)} model={model} onExit={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('投手の後ろから');
    expect(screen.getByText('リリースのコマが見つかりませんでした。コマ送りで指定できます')).toBeInTheDocument();
  });

  it('結果を保存すると trajectory.json を書き出す', async () => {
    render(<TrajectoryResult run={makeRun()} model={model} onExit={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: '結果を保存' }));
    expect(downloadJson).toHaveBeenCalledWith(
      'clip_trajectory.json',
      expect.objectContaining({ schema: 'cap-pose-lab/trajectory', speedKmh: 86.6, release: { frame: 100, source: 'auto' } }),
    );
  });

  it('検出した点は誤検出かどうかで分けず、すべて一覧に出す', () => {
    const records = syntheticThrow({ outliers: [110, 118], capInHand: [90] });
    render(<TrajectoryResult run={makeRun(records)} model={model} onExit={() => undefined} />);
    expect(screen.queryByText(/誤検出/)).toBeNull();
    const rows = screen.getAllByRole('row').slice(1); // 見出しの行を除く
    const detected = records.filter((r) => r.cap !== null).map((r) => String(r.frame));
    expect(rows.map((r) => r.querySelector('td')?.textContent)).toEqual(detected);
  });

  it('「最初に戻る」で抜けられる', async () => {
    const onExit = vi.fn();
    render(<TrajectoryResult run={makeRun()} model={model} onExit={onExit} />);
    await userEvent.click(screen.getByRole('button', { name: '最初に戻る' }));
    expect(onExit).toHaveBeenCalled();
  });
});
