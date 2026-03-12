#!/usr/bin/env node

import { parseArgs } from "./args.js";
import { listMergedPRs, fetchPRStats } from "./fetch.js";
import { loadCache, saveCache } from "./cache.js";
import { aggregateByUser } from "./aggregate.js";
import { printPRTable, printUserSummary, printHeader } from "./output.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  printHeader(args.org, args.repo, args.last);

  // 1. Load cached PRs from disk
  const cached = args.noCache ? [] : loadCache(args.org, args.repo);
  const cachedByNumber = new Map(cached.map((pr) => [pr.number, pr]));

  // 2. List merged PRs for the date range (cheap — one CLI call)
  const listed = await listMergedPRs(args.org, args.repo, args.last);

  // 3. Partition: cached vs uncached
  const uncached = listed.filter((pr) => !cachedByNumber.has(pr.number));
  const cachedInRange = listed
    .filter((pr) => cachedByNumber.has(pr.number))
    .map((pr) => cachedByNumber.get(pr.number)!);

  // 4. Fetch diff stats ONLY for uncached PRs
  const newlyFetched = await fetchPRStats(args.org, args.repo, uncached);

  // 5. Merge cached + newly fetched
  const allPRs = [...cachedInRange, ...newlyFetched].sort(
    (a, b) => b.total - a.total
  );

  // 6. Save only newly fetched PRs to cache
  if (!args.noCache && newlyFetched.length > 0) {
    saveCache(args.org, args.repo, newlyFetched);
  }

  if (allPRs.length === 0) {
    console.log("\nNo merged PRs found in this timeframe.");
    return;
  }

  if (newlyFetched.length > 0 && cachedInRange.length > 0) {
    console.log(
      `\n  ${cachedInRange.length} cached, ${newlyFetched.length} newly fetched`
    );
  }

  printPRTable(allPRs);

  const userStats = aggregateByUser(allPRs);
  printUserSummary(userStats);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
