import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RunProgress } from './RunProgress';

describe('RunProgress', () => {
  it('目安より多く届いても 100% を超えて表示しない', () => {
    render(<RunProgress state={{ label: 'x', done: 120, total: 100, eta: '' }} onCancel={() => undefined} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
