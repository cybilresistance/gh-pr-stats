import { execSync } from "child_process";
import { parseDuration } from "./args.js";
import type { CommitInfo, PRListItem, PRStats } from "./types.js";

const PR_LIMIT = 1000;

interface GHPullRequest {
  number: number;
  title: string;
  author: { login: string };
  mergedAt: string;
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

function fetchWindow(
  org: string,
  repo: string,
  from: string,
  to: string
): GHPullRequest[] {
  const search = `merged:${from}..${to}`;
  const listCmd = `gh pr list --repo ${org}/${repo} --state merged --search "${search}" --limit ${PR_LIMIT} --json number,title,author,mergedAt`;

  const output = execSync(listCmd, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function midpoint(from: Date, to: Date): Date {
  return new Date(from.getTime() + (to.getTime() - from.getTime()) / 2);
}

/**
 * Recursively fetch PR list for a date range, subdividing when results hit the cap.
 */
function fetchRange(
  org: string,
  repo: string,
  from: Date,
  to: Date,
  seen: Set<number>,
  depth: number = 0
): GHPullRequest[] {
  const fromStr = toDateStr(from);
  const toStr = toDateStr(to);

  // Stop subdividing if the window is a single day
  if (fromStr === toStr) {
    const prs = fetchWindow(org, repo, fromStr, toStr);
    if (prs.length >= PR_LIMIT) {
      console.warn(`  ⚠ ${fromStr}: ${prs.length} PRs in a single day — some may be missing`);
    }
    return prs.filter((pr) => {
      if (seen.has(pr.number)) return false;
      seen.add(pr.number);
      return true;
    });
  }

  const prs = fetchWindow(org, repo, fromStr, toStr);

  if (prs.length < PR_LIMIT) {
    // Under the cap — all results are here
    return prs.filter((pr) => {
      if (seen.has(pr.number)) return false;
      seen.add(pr.number);
      return true;
    });
  }

  // Hit the cap — split the range in half and recurse
  const mid = midpoint(from, to);
  console.log(`  Subdividing ${fromStr}..${toStr} (hit ${PR_LIMIT} cap)...`);

  const left = fetchRange(org, repo, from, mid, seen, depth + 1);
  const right = fetchRange(org, repo, new Date(mid.getTime() + 86400000), to, seen, depth + 1);

  return [...left, ...right];
}

export async function listMergedPRs(
  org: string,
  repo: string,
  last: string
): Promise<PRListItem[]> {
  const since = parseDuration(last);
  const now = new Date();

  checkGh();

  console.log(`\n  Fetching merged PRs since ${toDateStr(since)}...`);

  let prs: GHPullRequest[];
  try {
    const seen = new Set<number>();
    prs = fetchRange(org, repo, since, now, seen);
  } catch (err: any) {
    throw new Error(
      `Failed to fetch PRs: ${err.message}\nMake sure you're authenticated with gh (run: gh auth login)`
    );
  }

  console.log(`  Found ${prs.length} merged PRs.`);

  return prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.author.login,
    mergedAt: pr.mergedAt,
  }));
}

export async function fetchPRStats(
  org: string,
  repo: string,
  prs: PRListItem[]
): Promise<PRStats[]> {
  if (prs.length === 0) return [];

  console.log(`  Fetching stats & commits for ${prs.length} PRs...`);

  const results: PRStats[] = [];
  for (const pr of prs) {
    let additions = 0;
    let deletions = 0;
    let commits: CommitInfo[] = [];

    try {
      const statsCmd = `gh api repos/${org}/${repo}/pulls/${pr.number} --jq '{additions, deletions}'`;
      const statsOutput = execSync(statsCmd, { encoding: "utf-8" });
      const stats = JSON.parse(statsOutput);
      additions = stats.additions;
      deletions = stats.deletions;
    } catch {
      // zero stats on failure
    }

    try {
      const commitsCmd = `gh api repos/${org}/${repo}/pulls/${pr.number}/commits --jq '[.[] | {sha: .sha, author: (.author.login // .commit.author.name // "unknown"), message: .commit.message}]'`;
      const commitsOutput = execSync(commitsCmd, { encoding: "utf-8" });
      commits = JSON.parse(commitsOutput);
    } catch {
      // empty commits on failure
    }

    results.push({
      number: pr.number,
      title: pr.title,
      author: pr.author,
      mergedAt: pr.mergedAt,
      additions,
      deletions,
      net: additions - deletions,
      total: additions + deletions,
      commits,
    });

    // Progress indicator
    if (results.length % 10 === 0) {
      process.stdout.write(`  ${results.length}/${prs.length}\r`);
    }
  }

  console.log(`  Fetched stats for ${results.length} PRs.`);
  return results;
}
