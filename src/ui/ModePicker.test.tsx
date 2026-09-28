import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import manifestJson from '../../public/models/manifest.json';
import { parseManifest } from '../inference/manifest';
import { ModePicker } from './ModePicker';

const models = parseManifest(manifestJson).pose;

describe('ModePicker', () => {
  it('軽い順に並び、おすすめに印が付く', () => {
    render(
      <ModePicker models={models} allowed={['fast', 'standard', 'detailed']} recommended="standard"
        estimateSec={() => 10} selected={null} onSelect={() => undefined} />,
    );
    const labels = screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
    expect(labels).toEqual(['はやい', 'ふつう', 'くわしい']);
    expect(screen.getByText('おすすめ')).toBeInTheDocument();
  });

  it('選べないモードは押せず、理由が分かる', async () => {
    const onSelect = vi.fn();
    render(
      <ModePicker models={models} allowed={['fast']} recommended="fast"
        estimateSec={() => 10} selected={null} onSelect={onSelect} />,
    );
    const detailed = screen.getByRole('radio', { name: 'くわしい' });
    expect(detailed).toBeDisabled();
    await userEvent.click(detailed);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getAllByText('この端末では選べません').length).toBe(2);
  });

  it('ダウンロード量と推定時間を表示する', () => {
    render(
      <ModePicker models={models} allowed={['fast', 'standard', 'detailed']} recommended="standard"
        estimateSec={(id) => (id === 'fast' ? 5 : 30)} selected={null} onSelect={() => undefined} />,
    );
    expect(screen.getByText(/約 13 MB/)).toBeInTheDocument();
    expect(screen.getByText(/約 5 秒/)).toBeInTheDocument();
  });
});
