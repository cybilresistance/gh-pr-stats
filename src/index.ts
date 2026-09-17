#!/usr/bin/env node

import { parseArgs } from "./args.js";
import {
  checkGh,
  countWindow,
  fetchPRStats,
  listMergedPRs,
  rangeStart,
} from "./fetch.js";
import {
  eachDay,
  groupContiguous,
  loadDay,
  mergeDay,
  saveDay,
} from "./cache.js";
import { aggregateByUser } from "./aggregate.js";
import { printUserSummary, printHeader } from "./output.js";
import type { PRStats } from "./types.js";

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  printHeader(args.org, args.repo, args.last);
  checkGh();

  const fromStr = toDateStr(rangeStart(args.last));
  const today = toDateStr(new Date());
  const days = eachDay(fromStr, today);

  console.log(`\n  Fetching merged PRs since ${fromStr}...`);

  // 1. Read whole days from cache. Today is never cached (still accumulating),
  //    and under --commits a day only counts if its PRs have commit data.
  const cachedPRs: PRStats[] = [];
  const missing: string[] = [];

  for (const day of days) {
    const hit = args.noCache || day === today ? null : loadDay(args.org, args.repo, day);
    if (hit && (!args.withCommits || hit.every((pr) => pr.commitsFetched))) {
      cachedPRs.push(...hit);
    } else {
      missing.push(day);
    }
  }

  if (cachedPRs.length > 0) {
    const cachedDays = days.length - missing.length;
    console.log(`  ${cachedPRs.length} PRs from cache (${cachedDays} days).`);
  }

  // 2. Fetch only the days we don't have, in contiguous runs so a quiet stretch
  //    is still one query rather than one per day.
  const ranges = groupContiguous(missing);
  const toFetch = ranges.reduce(
    (sum, [a, b]) => sum + countWindow(args.org, args.repo, a, b),
    0
  );
  if (toFetch > 0) console.log(`  ${toFetch} PRs to fetch.`);

  const progress = { done: 0, total: toFetch };
  const fetched: PRStats[] = [];

  for (const [a, b] of ranges) {
    const listed = await listMergedPRs(args.org, args.repo, a, b, progress);
    fetched.push(
      ...(await fetchPRStats(args.org, args.repo, listed, args.withCommits))
    );
  }

  // 3. Write back each completed day we just fetched
  if (!args.noCache) {
    const byDay = new Map<string, PRStats[]>();
    for (const day of missing) if (day !== today) byDay.set(day, []);
    for (const pr of fetched) byDay.get(mergeDay(pr))?.push(pr);
    for (const [day, prs] of byDay) saveDay(args.org, args.repo, day, prs);
  }

  const allPRs = [...cachedPRs, ...fetched];

  if (allPRs.length === 0) {
    console.log("\nNo merged PRs found in this timeframe.");
    return;
  }

  console.log(`  ${allPRs.length} merged PRs total.        `);

  const userStats = aggregateByUser(allPRs);
  printUserSummary(userStats, args.withCommits);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
