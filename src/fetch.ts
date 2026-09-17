import { execSync } from "child_process";
import { parseDuration } from "./args.js";
import type { CommitInfo, PRListItem, PRStats } from "./types.js";

const PR_LIMIT = 1000;

interface GHPullRequest {
  number: number;
  title: string;
  author: { login: string };
  mergedAt: string;
  additions: number;
  deletions: number;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function checkGh(): void {
  try {
    execSync("gh --version", { stdio: "ignore" });
  } catch {
    throw new Error(
      "gh CLI is not installed or not in PATH. Install it from https://cli.github.com/"
    );
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** GitHub's GraphQL endpoint intermittently 502s on large paginated queries. */
function isTransient(message: string): boolean {
  return /HTTP (50[0234]|429)|Bad Gateway|Service Unavailable|Gateway Time-?out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up/i.test(
    message
  );
}

function ghExec(cmd: string, attempts: number = 4): string {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return execSync(cmd, {
        encoding: "utf-8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err: any) {
      lastErr = err;
      const message = `${err.message ?? ""}\n${err.stderr ?? ""}`;
      if (i === attempts - 1 || !isTransient(message)) throw err;
      const backoff = 1000 * 2 ** i;
      console.warn(`  ⚠ transient GitHub error, retrying in ${backoff / 1000}s...`);
      sleepSync(backoff);
    }
  }
  throw lastErr;
}

/**
 * Cheap count of merged PRs in a window — one search API call, no diff stats.
 * Used to decide whether a window needs subdividing, so we never pay for a
 * 1000-record diff-stat fetch just to discover it was capped.
 */
function countWindow(org: string, repo: string, from: string, to: string): number {
  const q = `repo:${org}/${repo} is:pr is:merged merged:${from}..${to}`;
  const cmd = `gh api -X GET search/issues -f q=${JSON.stringify(q)} -F per_page=1 --jq '.total_count'`;
  return parseInt(ghExec(cmd).trim(), 10);
}

function fetchWindow(
  org: string,
  repo: string,
  from: string,
  to: string,
  limit: number = PR_LIMIT
): GHPullRequest[] {
  const search = `merged:${from}..${to}`;
  // additions/deletions come back in this same paginated query, so no per-PR
  // API call is needed for line counts.
  const listCmd = `gh pr list --repo ${org}/${repo} --state merged --search "${search}" --limit ${limit} --json number,title,author,mergedAt,additions,deletions`;

  return JSON.parse(ghExec(listCmd));
}

function midpoint(from: Date, to: Date): Date {
  return new Date(from.getTime() + (to.getTime() - from.getTime()) / 2);
}

/**
 * Recursively fetch PR list for a date range, subdividing when a window holds
 * more PRs than a single search query can return.
 *
 * The window size is decided by a cheap count call, NOT by fetching records and
 * checking whether they hit the cap — on a busy repo that wasted a full
 * 1000-record diff-stat fetch (~10 API pages) at every level of the recursion.
 */
function fetchRange(
  org: string,
  repo: string,
  from: Date,
  to: Date,
  seen: Set<number>,
  progress: { done: number; total: number }
): GHPullRequest[] {
  const fromStr = toDateStr(from);
  const toStr = toDateStr(to);

  const count = countWindow(org, repo, fromStr, toStr);

  // Nothing merged in this window — skip the fetch entirely
  if (count === 0) return [];

  const dedupe = (prs: GHPullRequest[]) =>
    prs.filter((pr) => {
      if (seen.has(pr.number)) return false;
      seen.add(pr.number);
      return true;
    });

  if (count <= PR_LIMIT || fromStr === toStr) {
    if (count > PR_LIMIT) {
      console.warn(
        `  ⚠ ${fromStr}: ${count} PRs merged in a single day — only ${PR_LIMIT} retrievable, ${count - PR_LIMIT} will be missing`
      );
    }
    // Ask for only as many as exist, so we don't page past the end
    const prs = dedupe(fetchWindow(org, repo, fromStr, toStr, Math.min(count, PR_LIMIT)));
    progress.done += prs.length;
    process.stdout.write(`  ${progress.done}/${progress.total} PRs\r`);
    return prs;
  }

  // Too many for one query — split the range in half and recurse
  const mid = midpoint(from, to);
  const left = fetchRange(org, repo, from, mid, seen, progress);
  const right = fetchRange(org, repo, new Date(mid.getTime() + 86400000), to, seen, progress);

  return [...left, ...right];
}

export function rangeStart(last: string): Date {
  return parseDuration(last);
}

export { checkGh, countWindow };

/**
 * Fetch every merged PR in the given inclusive date range (UTC, YYYY-MM-DD).
 */
export async function listMergedPRs(
  org: string,
  repo: string,
  fromStr: string,
  toStr: string,
  progress: { done: number; total: number }
): Promise<PRListItem[]> {
  let prs: GHPullRequest[];
  try {
    const seen = new Set<number>();
    prs = fetchRange(
      org,
      repo,
      new Date(`${fromStr}T00:00:00Z`),
      new Date(`${toStr}T00:00:00Z`),
      seen,
      progress
    );
  } catch (err: any) {
    throw new Error(
      `Failed to fetch PRs: ${err.message}\nMake sure you're authenticated with gh (run: gh auth login)`
    );
  }

  return prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.author.login,
    mergedAt: pr.mergedAt,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
  }));
}

function toPRStats(pr: PRListItem, commits: CommitInfo[], commitsFetched: boolean): PRStats {
  return {
    number: pr.number,
    title: pr.title,
    author: pr.author,
    mergedAt: pr.mergedAt,
    additions: pr.additions,
    deletions: pr.deletions,
    net: pr.additions - pr.deletions,
    total: pr.additions + pr.deletions,
    commits,
    commitsFetched,
  };
}

/**
 * Fetch the per-PR commit list. This is one API call per PR — expensive on busy
 * repos — so it is opt-in via --commits and off by default. Line counts do NOT
 * depend on it; they come from the PR list query.
 */
function fetchCommits(org: string, repo: string, prNumber: number): CommitInfo[] {
  try {
    const commitsCmd = `gh api repos/${org}/${repo}/pulls/${prNumber}/commits --jq '[.[] | {sha: .sha, author: (.author.login // .commit.author.name // "unknown"), message: .commit.message}]'`;
    return JSON.parse(execSync(commitsCmd, { encoding: "utf-8" }));
  } catch {
    return [];
  }
}

export async function fetchPRStats(
  org: string,
  repo: string,
  prs: PRListItem[],
  withCommits: boolean = false
): Promise<PRStats[]> {
  if (prs.length === 0) return [];

  if (!withCommits) {
    // No extra API calls: additions/deletions already came from the list query.
    return prs.map((pr) => toPRStats(pr, [], false));
  }

  console.log(`  Fetching commits for ${prs.length} PRs (1 API call each)...`);

  const results: PRStats[] = [];
  for (const pr of prs) {
    results.push(toPRStats(pr, fetchCommits(org, repo, pr.number), true));

    // Progress indicator
    if (results.length % 10 === 0) {
      process.stdout.write(`  ${results.length}/${prs.length}\r`);
    }
  }

  console.log(`  Fetched commits for ${results.length} PRs.`);
  return results;
}
