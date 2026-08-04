import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'iife'],
    globalName: 'MoonsenderPush',
    dts: true,
    sourcemap: true,
    clean: true,
    outExtension({ format }) {
      return { js: format === 'iife' ? '.global.js' : '.mjs' }
    },
  },
  {
    // The service-worker bundle is self-contained: sites either importScripts() it from a CDN
    // inside a one-line stub at their origin, or vendor the file directly.
    entry: { sw: 'src/sw.ts' },
    format: ['iife'],
    sourcemap: true,
    outExtension() {
      return { js: '.js' }
    },
  },
])
