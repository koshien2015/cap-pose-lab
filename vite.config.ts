/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/cap-pose-lab/',
  plugins: [react(), tailwindcss()],
  // ORT は wasm を自前で読み込むので事前バンドルしない
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/inference/**/*.ts', 'src/tracking/**/*.ts', 'src/export/**/*.ts', 'src/content/**/*.ts'],
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
