/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const BASE = '/cap-pose-lab/';

/**
 * 開発サーバだけの対処。Vite は変数での動的 import に `?import` を付けるが、public/ のスクリプトは
 * `?import` 付きだと配信を拒否するため、ORT が自分の .mjs を読み込めなくなる（本番ビルドでは起きない）。
 */
function serveOrtAsPlainScript(): Plugin {
  return {
    name: 'serve-ort-as-plain-script',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith(`${BASE}ort/`)) req.url = req.url.replace(/\?import$/, '');
        next();
      });
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), serveOrtAsPlainScript()],
  // ORT は wasm を自前で読み込むので事前バンドルしない
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: {
    rollupOptions: {
      input: { main: 'index.html', diagnostics: 'diagnostics.html' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/inference/**/*.ts', 'src/tracking/**/*.ts', 'src/export/**/*.ts', 'src/content/**/*.ts', 'src/flow/**/*.ts'],
      // ブラウザ API に直結する層は E2E（計画4）で見る
      exclude: [
        'src/inference/videoSource.ts',
        'src/inference/frameCanvas.ts',
        'src/inference/ortSession.ts',
        'src/inference/runPose.ts',
        'src/inference/capabilities.ts',
        '**/*.test.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
