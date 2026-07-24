import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'review-stage': 'src/review-stage.ts',
  },
  outDir: 'skills/review-npm-stage/dist',
  deps: {
    onlyBundle: false,
    onlyImport: [],
  },
})
