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

  it('はじめに画面から、投球の軌跡の解析に進める', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '投球の軌跡を見る（試験的）' }));
    expect(screen.getByRole('heading', { name: '投球の軌跡（試験的）' })).toBeInTheDocument();
  });
});
