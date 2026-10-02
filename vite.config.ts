import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "chrome120",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "markdown-vendor": [
            "react-markdown",
            "rehype-katex",
            "remark-gfm",
            "remark-math",
          ],
          "katex-vendor": ["katex"],
          "flow-vendor": ["@xyflow/react"],
          "editor-vendor": [
            "@codemirror/commands",
            "@codemirror/lang-markdown",
            "@codemirror/language",
            "@codemirror/state",
            "@codemirror/view",
            "@lezer/common",
            "@lezer/highlight",
            "@lezer/markdown",
          ],
        },
      },
    },
  },
});
