import esbuild from 'esbuild'
import { globSync } from 'glob'
import { RewriteImportsPlugin } from './build.rewrite-imports.mjs'

esbuild
  .build({
    entryPoints: globSync('./**/*.mjs', {
      ignore: ['./node_modules/**/*', './tests/**/*', './build/**/*']
    }),
    outdir: 'cjs',
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    bundle: false,
    plugins: [new RewriteImportsPlugin()]
  })
  .catch(() => process.exit(1))
