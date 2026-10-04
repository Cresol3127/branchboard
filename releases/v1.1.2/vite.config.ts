import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 3000,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${process.env.PORT || env.PORT || 3001}` },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: { canvas: ['@xyflow/react'], markdown: ['react-markdown', 'remark-gfm'] },
        },
      },
    },
  };
});
