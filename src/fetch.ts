import { execSync } from "child_process";
import { parseDuration } from "./args.js";
import type { PRListItem, PRStats } from "./types.js";

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

  const listCmd = `gh pr list --repo ${org}/${repo} --state merged --search "merged:>=${sinceStr}" --limit 300 --json number,title,author,mergedAt`;

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

  console.log(`  Fetching diff stats for ${prs.length} PRs...`);

  const results: PRStats[] = [];
  for (const pr of prs) {
    try {
      const statsCmd = `gh api repos/${org}/${repo}/pulls/${pr.number} --jq '{additions, deletions}'`;
      const statsOutput = execSync(statsCmd, { encoding: "utf-8" });
      const stats = JSON.parse(statsOutput);

      results.push({
        number: pr.number,
        title: pr.title,
        author: pr.author,
        mergedAt: pr.mergedAt,
        additions: stats.additions,
        deletions: stats.deletions,
        net: stats.additions - stats.deletions,
        total: stats.additions + stats.deletions,
      });
    } catch {
      // If we can't get stats for a PR, include it with zero stats
      results.push({
        number: pr.number,
        title: pr.title,
        author: pr.author,
        mergedAt: pr.mergedAt,
        additions: 0,
        deletions: 0,
        net: 0,
        total: 0,
      });
    }

    // Progress indicator
    if (results.length % 10 === 0) {
      process.stdout.write(`  ${results.length}/${prs.length}\r`);
    }
  }

  console.log(`  Fetched stats for ${results.length} PRs.`);
  return results;
}
