import { MergeNeedleOpts } from '../../schema/util.mts'

export const mergeNeedleOpts = MergeNeedleOpts.implement((config, opts) => {
  if (config.needleOpts) {
    return {
      ...opts,
      ...config.needleOpts,
      headers: {
        ...opts.headers,
        ...(config.needleOpts.headers ?? {})
      }
    }
  }

  return opts
})
