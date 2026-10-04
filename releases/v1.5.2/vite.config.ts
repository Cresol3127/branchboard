import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    // Prebundle lazy features too, so first use does not trigger a page reload.
    optimizeDeps: {
      include: [
        '@tiptap/react',
        '@tiptap/core',
        '@tiptap/starter-kit',
        '@tiptap/markdown',
        '@tiptap/extension-task-list',
        '@tiptap/extension-task-item',
        '@tiptap/extension-table',
        'marked',
        'html-to-image',
        'jspdf',
      ],
    },
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
