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
});
