import { defineConfig } from 'vite';
import { selfHostedDecoders } from './vite-plugin-decoders.js';
// base './' so the build works at any sub-path (build contract, 08 section 5.1).
// v3 loads KTX2 textures and meshopt GLBs (models, streamed terrain tiles): the
// Basis transcoder is served from the site's own origin by the template's
// decoder plugin (template-changes T-24: no string evaluation, so it decodes
// under the showcase CSP); the meshopt decoder is bundled from the pinned three.
export default defineConfig({
  base: './',
  plugins: [selfHostedDecoders()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    assetsInlineLimit: 4096,
  },
  server: { port: 5206 },
  // Own port: other immersive repos' preview servers share this machine.
  preview: { port: 4186, strictPort: true, host: '127.0.0.1' },
  define: {
    // Test hooks exposed only when building with VITE_TEST_HOOKS=1 (release builds omit them).
    '__TEST_HOOKS__': JSON.stringify(process.env.VITE_TEST_HOOKS === '1'),
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.js'],
  },
});
