import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: 'index.mjs',
    outDir: 'cjs',
    format: 'cjs'
  }
])
