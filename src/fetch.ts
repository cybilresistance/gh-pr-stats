import { execSync } from "child_process";
import { parseDuration } from "./args.js";
import type { CommitInfo, PRListItem, PRStats } from "./types.js";

interface GHPullRequest {
  number: number;
  title: string;
  author: { login: string };
  mergedAt: string;
}

export async function listMergedPRs(
  org: string,
  repo: string,
  last: string
): Promise<PRListItem[]> {
  const since = parseDuration(last);
  const sinceStr = since.toISOString().split("T")[0];

  // Check gh is available
  try {
    execSync("gh --version", { stdio: "ignore" });
  } catch {
    throw new Error(
      "gh CLI is not installed or not in PATH. Install it from https://cli.github.com/"
    );
  }

  console.log(`\n  Fetching merged PRs since ${sinceStr}...`);

  const PR_LIMIT = 1000;
  const listCmd = `gh pr list --repo ${org}/${repo} --state merged --search "merged:>=${sinceStr}" --limit ${PR_LIMIT} --json number,title,author,mergedAt`;

  let prs: GHPullRequest[];
  try {
    const output = execSync(listCmd, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    prs = JSON.parse(output);
  } catch (err: any) {
    throw new Error(
      `Failed to fetch PRs: ${err.message}\nMake sure you're authenticated with gh (run: gh auth login)`
    );
  }

  console.log(`  Found ${prs.length} merged PRs.`);

  if (prs.length >= PR_LIMIT) {
    console.warn(`\n  ⚠ Results capped at ${PR_LIMIT} — some PRs may be missing. Try a shorter time range.`);
  }

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
