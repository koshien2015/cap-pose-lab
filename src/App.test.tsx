import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./inference/capabilities', () => ({ detectCapabilities: () => new Promise(() => undefined) }));
vi.mock('./inference/manifest', async (orig) => ({
  ...(await orig<typeof import('./inference/manifest')>()),
  loadManifest: () => new Promise(() => undefined),
}));

import { App } from './App';

describe('App', () => {
  it('はじめに → 準備画面へ進む', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '投球フォーム解析' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(screen.getByText('この端末で解析できるか確認しています…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('はじめに画面から、保存した解析結果を読み込んで比べる入口がある', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '保存した解析結果で比べる' }));
    expect(screen.getByText(/保存した解析結果（_pose.json）を選ぶ/)).toBeInTheDocument();
  });

  it('はじめに画面から、打者のスイングの比較に進める', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '打者のスイングを比べる' }));
    expect(screen.getByText('この端末で解析できるか確認しています…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('はじめに画面から、保存した打者の結果を読み込んで比べる入口がある', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '保存した打者の結果で比べる' }));
    expect(screen.getByText(/保存した解析結果（_pose.json）を選ぶ/)).toBeInTheDocument();
  });

  it('はじめに画面で、打者の撮り方（捕手の後ろ・構えから）を案内する', () => {
    render(<App />);
    expect(screen.getByText(/捕手の後ろから/)).toBeInTheDocument();
    expect(screen.getByText(/構えから撮り始めて/)).toBeInTheDocument();
  });

  it('はじめに画面から、投球の軌跡の解析に進める', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '投球の軌跡を見る（試験的）' }));
    expect(screen.getByRole('heading', { name: '投球の軌跡（試験的）' })).toBeInTheDocument();
  });
});
