import type { PRStats, UserStats } from "./types.js";

export function aggregateByUser(prs: PRStats[]): UserStats[] {
  const map = new Map<string, UserStats>();

  function getOrCreate(author: string): UserStats {
    let stats = map.get(author);
    if (!stats) {
      stats = {
        author,
        prCount: 0,
        commitCount: 0,
        additions: 0,
        deletions: 0,
        net: 0,
        total: 0,
      };
      map.set(author, stats);
    }
    return stats;
  }

  for (const pr of prs) {
    // PR-level stats go to the PR author
    const prAuthor = getOrCreate(pr.author);
    prAuthor.prCount++;
    prAuthor.additions += pr.additions;
    prAuthor.deletions += pr.deletions;
    prAuthor.net += pr.net;
    prAuthor.total += pr.total;

    // Commit counts go to each commit author
    for (const commit of pr.commits) {
      const commitAuthor = getOrCreate(commit.author);
      commitAuthor.commitCount++;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
