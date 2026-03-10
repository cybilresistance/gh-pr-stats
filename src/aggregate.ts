import type { PRStats, UserStats } from "./types.js";

export function aggregateByUser(prs: PRStats[]): UserStats[] {
  const map = new Map<string, UserStats>();

  for (const pr of prs) {
    const existing = map.get(pr.author);
    if (existing) {
      existing.prCount++;
      existing.additions += pr.additions;
      existing.deletions += pr.deletions;
      existing.net += pr.net;
    } else {
      map.set(pr.author, {
        author: pr.author,
        prCount: 1,
        additions: pr.additions,
        deletions: pr.deletions,
        net: pr.net,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.net - a.net);
}
