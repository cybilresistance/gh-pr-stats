#!/usr/bin/env node

import { parseArgs } from "./args.js";
import { fetchMergedPRs } from "./fetch.js";
import { loadCache, saveCache } from "./cache.js";
import { aggregateByUser } from "./aggregate.js";
import { printPRTable, printUserSummary, printHeader } from "./output.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  printHeader(args.org, args.repo, args.last);

  const cached = args.noCache ? [] : loadCache(args.org, args.repo);
  const cachedNumbers = new Set(cached.map((pr) => pr.number));

  const fetched = await fetchMergedPRs(args.org, args.repo, args.last);
  const toFetch = fetched.filter((pr) => !cachedNumbers.has(pr.number));
  const alreadyCached = cached.filter((pr) =>
    fetched.some((f) => f.number === pr.number)
  );

  const allPRs = [...alreadyCached, ...toFetch].sort(
    (a, b) =>
      new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime()
  );

  if (!args.noCache && toFetch.length > 0) {
    saveCache(args.org, args.repo, allPRs);
  }

  if (allPRs.length === 0) {
    console.log("\nNo merged PRs found in this timeframe.");
    return;
  }

  if (toFetch.length > 0 && cached.length > 0) {
    console.log(
      `\n  ${alreadyCached.length} cached, ${toFetch.length} fetched\n`
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
