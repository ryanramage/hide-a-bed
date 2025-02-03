import { Type } from '@sinclair/typebox'
import { CouchConfig } from './config.mjs'

export const PatchConfig = Type.Intersect([
  CouchConfig,
  Type.Object({
    retries: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    delay: Type.Optional(Type.Number({ minimum: 0 }))
  })
])

export const PatchDoc = Type.Object({
  id: Type.String(),
  properties: Type.Record(Type.String(), Type.Any())
})
