# gh-pr-stats

CLI tool to fetch merged PR stats (lines added/removed/net) per user for a GitHub org/repo.

## Setup

```bash
npm install
```

Requires [gh CLI](https://cli.github.com/) installed and authenticated.

## Usage

```bash
npx tsx src/index.ts --org <org> --repo <repo> --last <duration>
```

### Options

| Flag | Description | Example |
|------|-------------|---------|
| `--org` | GitHub org or owner (required) | `facebook` |
| `--repo` | Repository name (required) | `react` |
| `--last` | Time period (required) | `30d`, `4w`, `3m` |
| `--no-cache` | Skip cache, fetch fresh | |
| `--help` | Show help | |

### Examples

```bash
# Last 30 days of React PRs
npx tsx src/index.ts --org facebook --repo react --last 30d

# Last 2 weeks, skip cache
npx tsx src/index.ts --org vercel --repo next.js --last 2w --no-cache
```

## Cache

Fetched PR data is cached in `.gh-pr-stats/cache/` to avoid re-fetching on subsequent runs. Use `--no-cache` to force a fresh fetch.

## Tech Stack

- TypeScript + tsx
- gh CLI (subprocess)
- Node.js 22
