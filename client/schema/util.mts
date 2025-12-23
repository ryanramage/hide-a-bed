import { z } from 'zod'
import { CouchConfig, NeedleBaseOptions, NeedleOptions } from './config.mts'

export const MergeNeedleOpts = z.function({
  input: [CouchConfig, NeedleBaseOptions],
  output: NeedleOptions
})
export type MergeNeedleOptsSchema = z.infer<typeof MergeNeedleOpts>
