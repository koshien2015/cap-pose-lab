import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals を使わない設定なので、Testing Library の自動 cleanup が登録されない。明示的に後片付けする
afterEach(cleanup);

// jsdom には canvas が無い。描画内容はテストしないので、何もしない 2D コンテキストを返す
const noop = () => undefined;
const fakeContext = new Proxy({}, { get: (_t, key) => (key === 'canvas' ? undefined : noop), set: () => true });
HTMLCanvasElement.prototype.getContext = (() => fakeContext) as unknown as HTMLCanvasElement['getContext'];
