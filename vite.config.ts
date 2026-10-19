import { defineConfig } from 'vite'

// Relative base so the build works on GitHub Pages under /<repo>/ and locally.
// Two pages: the studio (index) and the Smart Toast player.
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { index: 'index.html', player: 'player.html' } } },
})
