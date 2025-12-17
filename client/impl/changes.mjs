// @ts-check
import { Changes } from '../../changes/schema/changes.mjs'

const relocationMessage = 'changes functionality moved to hide-a-bed-changes. Install hide-a-bed-changes and call its changes() helper instead.'

/** @type { import('../../changes/schema/changes.mjs').ChangesSchema } */
export const changes = Changes.implement(async () => {
  throw new Error(relocationMessage)
})

export const _relocationMessage = relocationMessage
