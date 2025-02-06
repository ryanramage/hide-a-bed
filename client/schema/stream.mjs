import { z } from 'zod'
import { CouchConfig } from './config.mjs'
import { SimpleViewOptions, ViewRow } from './query.mjs'

export const OnRow = z.function().args(
  ViewRow
)
/** @typedef { z.infer<typeof OnRow> } OnRowSchema */

export const SimpleViewQueryStream = z.function().args(
  CouchConfig,
  z.string().describe('the view name'),
  SimpleViewOptions,
  OnRow
).returns(z.promise(z.undefined()))
/** @typedef { z.infer<typeof SimpleViewQueryStream> } SimpleViewQueryStreamSchema */

export const SimpleViewQueryStreamBound = z.function().args(
  z.string().describe('the view name'),
  SimpleViewOptions,
  OnRow
).returns(z.promise(z.undefined()))
/** @typedef { z.infer<typeof SimpleViewQueryStreamBound> } SimpleViewQueryStreamBoundSchema */
