import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { PRStats } from "./types.js";

function getCacheDir(org: string, repo: string): string {
  return join(process.cwd(), ".gh-pr-stats", "cache", org, repo);
}

export function loadCache(org: string, repo: string): PRStats[] {
  const dir = getCacheDir(org, repo);
  if (!existsSync(dir)) return [];

  const results: PRStats[] = [];
  const files = readdirSync(dir) as string[];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = readFileSync(join(dir, file), "utf-8");
      const pr = JSON.parse(data);
      pr.total ??= (pr.additions ?? 0) + (pr.deletions ?? 0);
      pr.commits ??= [];
      results.push(pr);
    } catch {
      // skip corrupt cache files
    }
  }

  return results;
}

export function saveCache(
  org: string,
  repo: string,
  prs: PRStats[]
): void {
  const dir = getCacheDir(org, repo);
  mkdirSync(dir, { recursive: true });

  for (const pr of prs) {
    const filePath = join(dir, `pr-${pr.number}.json`);
    writeFileSync(filePath, JSON.stringify(pr, null, 2));
  }
}
