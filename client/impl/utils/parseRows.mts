/* eslint-disable @typescript-eslint/no-explicit-any */
import { ViewRow } from '../../schema/couch/couch.output.schema.ts'
import type { StandardSchemaV1 } from '../../types/standard-schema.ts'
import { z } from 'zod'
import { OperationError, ValidationError, type ErrorOperation } from './errors.mts'

export type OnInvalidDocAction = 'throw' | 'skip'

const createValidationError = (
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
  options: {
    defaultMessage?: string
    docId?: string
    operation?: ErrorOperation
  }
) => {
  return new ValidationError({
    docId: options.docId,
    issues,
    message: options.defaultMessage ?? 'Row validation failed',
    operation: options.operation ?? 'request'
  })
}

export async function parseRows<
  DocSchema extends StandardSchemaV1 = StandardSchemaV1<any>,
  KeySchema extends StandardSchemaV1 = StandardSchemaV1<any>,
  ValueSchema extends StandardSchemaV1 = StandardSchemaV1<any>
>(
  rows: unknown,
  options: {
    defaultMessage?: string
    onInvalidDoc?: OnInvalidDocAction
    docSchema?: DocSchema
    keySchema?: KeySchema
    operation?: ErrorOperation
    valueSchema?: ValueSchema
  }
) {
  if (!Array.isArray(rows)) {
    throw new OperationError(options.defaultMessage ?? 'Request failed', {
      operation: options.operation ?? 'request'
    })
  }

  type ParsedRow = {
    id?: string
    key?: StandardSchemaV1.InferOutput<KeySchema>
    value?: StandardSchemaV1.InferOutput<ValueSchema>
    doc?: StandardSchemaV1.InferOutput<DocSchema>
    error?: string
  }
  type RowResult = ParsedRow | 'skip'
  const isFinalRow = (row: RowResult): row is ParsedRow => row !== 'skip'

  const parsedRows: Array<RowResult> = await Promise.all(
    rows.map(async (row: any) => {
      try {
        /**
         * If no doc is present, parse without doc validation.
         * This allows handling of not-found documents or rows without docs.
         */
        if (row.doc == null) {
          const parsedRow = z.looseObject(ViewRow.shape).parse(row)
          if (options.keySchema) {
            const parsedKey = await options.keySchema['~standard'].validate(row.key)
            if (parsedKey.issues) {
              throw createValidationError(parsedKey.issues, {
                defaultMessage: options.defaultMessage,
                docId: typeof row.id === 'string' ? row.id : undefined,
                operation: options.operation
              })
            }
            parsedRow.key = parsedKey.value
          }
          if (options.valueSchema) {
            const parsedValue = await options.valueSchema['~standard'].validate(row.value)
            if (parsedValue.issues) {
              throw createValidationError(parsedValue.issues, {
                defaultMessage: options.defaultMessage,
                docId: typeof row.id === 'string' ? row.id : undefined,
                operation: options.operation
              })
            }
            parsedRow.value = parsedValue.value
          }
          return parsedRow
        }

        let parsedDoc = row.doc
        let parsedKey = row.key
        let parsedValue = row.value

        if (options.docSchema) {
          const parsedDocRes = await options.docSchema['~standard'].validate(row.doc)
          if (parsedDocRes.issues) {
            if (options.onInvalidDoc === 'skip') {
              // skip invalid doc
              return 'skip'
            } else {
              // throw by default
              throw createValidationError(parsedDocRes.issues, {
                defaultMessage: options.defaultMessage,
                docId: typeof row.id === 'string' ? row.id : undefined,
                operation: options.operation
              })
            }
          } else {
            parsedDoc = parsedDocRes.value
          }
        }

        if (options.keySchema) {
          const parsedKeyRes = await options.keySchema['~standard'].validate(row.key)
          if (parsedKeyRes.issues) {
            throw createValidationError(parsedKeyRes.issues, {
              defaultMessage: options.defaultMessage,
              docId: typeof row.id === 'string' ? row.id : undefined,
              operation: options.operation
            })
          } else {
            parsedKey = parsedKeyRes.value
          }
        }

        if (options.valueSchema) {
          const parsedValueRes = await options.valueSchema['~standard'].validate(row.value)
          if (parsedValueRes.issues) {
            throw createValidationError(parsedValueRes.issues, {
              defaultMessage: options.defaultMessage,
              docId: typeof row.id === 'string' ? row.id : undefined,
              operation: options.operation
            })
          } else {
            parsedValue = parsedValueRes.value
          }
        }

        return {
          ...row,
          doc: parsedDoc,
          key: parsedKey,
          value: parsedValue
        }
      } catch (e) {
        if (options.onInvalidDoc === 'skip') {
          // skip invalid doc
          return 'skip'
        } else {
          // throw by default
          throw e
        }
      }
    })
  )

  return parsedRows.filter(isFinalRow)
}
