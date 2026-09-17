import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { PRStats } from "./types.js";

/**
 * The cache is keyed by UTC merge date, not by PR number.
 *
 * Caching individual PRs doesn't help: the expensive call is the PR *list*
 * query, and you need to run it to discover which PRs exist in the first place.
 * A past day's set of merged PRs never changes, so a day is the natural unit —
 * once a day is stored we never query that date range again.
 *
 * Today is never cached, since more PRs may still merge.
 */

function getCacheDir(org: string, repo: string): string {
  return join(process.cwd(), ".gh-pr-stats", "cache", org, repo);
}

function dayFile(org: string, repo: string, day: string): string {
  return join(getCacheDir(org, repo), `day-${day}.json`);
}

function hydrate(pr: any): PRStats {
  pr.total ??= (pr.additions ?? 0) + (pr.deletions ?? 0);
  pr.net ??= (pr.additions ?? 0) - (pr.deletions ?? 0);
  pr.commits ??= [];
  pr.commitsFetched ??= pr.commits.length > 0;
  return pr as PRStats;
}

/** Returns null when the day isn't cached (or the file is unreadable). */
export function loadDay(org: string, repo: string, day: string): PRStats[] | null {
  const file = dayFile(org, repo, day);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    if (!Array.isArray(parsed)) return null;
    return parsed.map(hydrate);
  } catch {
    return null; // corrupt cache file — refetch
  }
}

export function saveDay(
  org: string,
  repo: string,
  day: string,
  prs: PRStats[]
): void {
  const dir = getCacheDir(org, repo);
  mkdirSync(dir, { recursive: true });
  writeFileSync(dayFile(org, repo, day), JSON.stringify(prs));
}

/** UTC date (YYYY-MM-DD) a PR was merged — the key it caches under. */
export function mergeDay(pr: { mergedAt: string }): string {
  return pr.mergedAt.split("T")[0];
}

export function eachDay(fromStr: string, toStr: string): string[] {
  const days: string[] = [];
  const cur = new Date(`${fromStr}T00:00:00Z`);
  const end = new Date(`${toStr}T00:00:00Z`);
  while (cur <= end) {
    days.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/** Collapse a sorted day list into contiguous [from, to] ranges. */
export function groupContiguous(days: string[]): Array<[string, string]> {
  const ranges: Array<[string, string]> = [];
  for (const day of days) {
    const last = ranges[ranges.length - 1];
    if (last && eachDay(last[1], day).length === 2) {
      last[1] = day; // day is exactly one after last[1]
    } else {
      ranges.push([day, day]);
    }
  }
  return ranges;
}
