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
| `--commits` | Also fetch per-PR commits (1 extra API call per PR) | |
| `--help` | Show help | |

### Examples

```bash
# Last 30 days of React PRs
npx tsx src/index.ts --org facebook --repo react --last 30d

# Last 2 weeks, skip cache
npx tsx src/index.ts --org vercel --repo next.js --last 2w --no-cache
```

## API usage

PR counts and line counts come entirely from the `gh pr list` query, which returns
`additions`/`deletions` inline — roughly one API call per 100 PRs.

Commit-level data (per-PR commit counts) needs one extra API call per PR, so it is
off by default. Add `--commits` if you need it; expect it to be much slower on
busy repos.

Windows holding more than 1000 PRs are split until each piece fits. Which windows
need splitting is decided by a cheap count query, so no fetched page is ever
discarded. Transient GitHub 5xx errors are retried with backoff.

## Cache

Cached in `.gh-pr-stats/cache/<org>/<repo>/` as one file per UTC day
(`day-YYYY-MM-DD.json`).

Days are the unit rather than PRs because the expensive call is the PR *list*
query — you have to run it to discover which PRs exist, so caching individual PR
records wouldn't save it. A past day's set of merged PRs never changes, so once a
day is stored its date range is never queried again. Today is never cached, since
more PRs may still merge.

On a repo merging ~150 PRs/day, a 30-day report goes from ~2m30s cold to ~5s warm.
Use `--no-cache` to force a fresh fetch.

## Tech Stack

- TypeScript + tsx
- gh CLI (subprocess)
- Node.js 22
