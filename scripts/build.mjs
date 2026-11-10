import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Inline every runtime dependency so a link, GitHub or copied install loads
// without its own node_modules. The Host composition supplies everything else
// through the Cordis Context, so nothing stays external.
await build({
  entryPoints: [join(root, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(root, 'dist/index.js'),
  legalComments: 'none',
  banner: {
    js: 'import { createRequire as __langoCreateRequire } from "node:module";\nconst require = __langoCreateRequire(import.meta.url);',
  },
})

// Desktop panel. React and react-dom come from the Desktop module loader;
// the QR encoder is inlined.
await build({
  entryPoints: [join(root, 'src/client/index.ts')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  minifySyntax: true,
  outfile: join(root, 'dist/client.js'),
  legalComments: 'none',
})

