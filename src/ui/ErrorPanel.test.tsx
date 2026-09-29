import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorPanel } from './ErrorPanel';

const error = { title: 'ダウンロードに失敗しました', action: 'もう一度試してください', detail: 'DownloadError: x', retryable: true };

describe('ErrorPanel', () => {
  it('何が起きたかと次にすることを出し、再試行を渡されたときだけボタンを出す', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorPanel error={error} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ダウンロードに失敗しました');
    await userEvent.click(screen.getByRole('button', { name: 'もう一度試す' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<ErrorPanel error={error} />);
    expect(screen.queryByRole('button', { name: 'もう一度試す' })).toBeNull();
  });
});
