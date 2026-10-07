import { defineConfig } from 'vite';
import { defaultViteConfig } from 'markedit-vite';
import pkg from './package.json' with { type: 'json' };

// markedit-vite externalizes markedit-api / CodeMirror (resolved to MarkEdit's
// live instances at runtime) and emits one CommonJS file into dist/. Locally it
// also copies that file into MarkEdit's scripts folder; CI has no MarkEdit.
export default defineConfig({
  ...defaultViteConfig({ copyDistFile: process.env.CI === undefined }),
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    // The debug harness (src/debug.ts) is only bundled by `npm run build:debug`.
    __DEBUG__: JSON.stringify(process.env.MFE_DEBUG === '1'),
  },
});
