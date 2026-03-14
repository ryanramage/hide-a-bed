import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: 'index.mts',
    outDir: 'dist/esm',
    dts: false,
    format: 'esm'
  },
  {
    entry: 'index.mts',
    outDir: 'dist/cjs',
    dts: false,
    format: 'cjs'
  }
])
