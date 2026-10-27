import { defineConfig } from 'vite';

// base './' so the build works at any sub-path (build contract, 08 section 5.1).
// No decoder plugin yet: Phase A ships JPEG/PNG only (no glTF/KTX2/Draco). If
// Phase B adopts KTX2 imagery, add the template's vite-plugin-decoders.js here
// (decoders served from the pinned three package, never vendored into public/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 4096,
  },
  server: { port: 5173 },
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
