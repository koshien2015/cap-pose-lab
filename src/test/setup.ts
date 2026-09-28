import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals を使わない設定なので、Testing Library の自動 cleanup が登録されない。明示的に後片付けする
afterEach(cleanup);
