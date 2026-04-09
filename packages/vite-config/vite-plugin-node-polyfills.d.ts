declare module 'vite-plugin-node-polyfills' {
  import type { Plugin } from 'vite';

  export function nodePolyfills(options?: Record<string, unknown>): Plugin;
}
