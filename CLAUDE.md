# gh-pr-stats

CLI tool for GitHub PR contribution stats.

## Commands

```bash
npm install          # Install deps
npm run start        # Run via tsx (needs args)
npm run build        # Compile TypeScript
npm run lint         # Type check
```

## Architecture

- `src/index.ts` — Entry point, orchestrates flow
- `src/args.ts` — CLI argument parsing and duration calculation
- `src/fetch.ts` — Fetches merged PRs and diff stats via gh CLI
- `src/cache.ts` — Disk cache in .gh-pr-stats/cache/
- `src/aggregate.ts` — Groups stats by user
- `src/output.ts` — Formatted console output with colors
- `src/types.ts` — Shared TypeScript interfaces

## Conventions

- ESM modules (type: module in package.json)
- Node16 module resolution
- No external runtime deps — only gh CLI subprocess
