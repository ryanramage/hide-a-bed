import fs from 'fs'

export class RewriteImportsPlugin {
  name = 'rewrite-imports'

  setup (build) {
    build.onLoad({ filter: /\.mjs$/ }, async (args) => {
      const contents = fs
        .readFileSync(args.path, 'utf8')
        .replace(/(from\s+['"].*?)\.mjs(['"])/g, '$1.cjs$2')
      return { contents, loader: 'js' }
    })
  }
}
