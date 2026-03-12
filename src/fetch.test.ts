import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PRListItem, PRStats } from "./types.js";

// Mock child_process before importing fetch module
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "child_process";
import { listMergedPRs, fetchPRStats } from "./fetch.js";

const mockExecSync = vi.mocked(execSync);

beforeEach(() => {
  vi.restoreAllMocks();
  // Suppress console output in tests
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

describe("listMergedPRs", () => {
  it("returns PRListItem[] from gh pr list output", async () => {
    const ghOutput = JSON.stringify([
      {
        number: 1,
        title: "Add feature",
        author: { login: "alice" },
        mergedAt: "2026-03-10T12:00:00Z",
      },
      {
        number: 2,
        title: "Fix bug",
        author: { login: "bob" },
        mergedAt: "2026-03-11T12:00:00Z",
      },
    ]);

    mockExecSync.mockImplementation((cmd: any) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("gh --version")) return "" as any;
      if (cmdStr.includes("gh pr list")) return ghOutput as any;
      return "" as any;
    });

    const result = await listMergedPRs("myorg", "myrepo", "7d");

    expect(result).toEqual([
      { number: 1, title: "Add feature", author: "alice", mergedAt: "2026-03-10T12:00:00Z" },
      { number: 2, title: "Fix bug", author: "bob", mergedAt: "2026-03-11T12:00:00Z" },
    ]);
  });

  it("subdivides when results hit the cap", async () => {
    const mockWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Generate 1000 fake PRs for the first call (triggers subdivision)
    const fullRange = Array.from({ length: 1000 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      author: { login: "alice" },
      mergedAt: "2026-03-10T12:00:00Z",
    }));

    // Left half returns 500, right half returns 600
    const leftHalf = fullRange.slice(0, 500);
    const rightHalf = fullRange.slice(400, 1000); // overlapping PR numbers 401-500

    let callCount = 0;
    mockExecSync.mockImplementation((cmd: any) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("gh --version")) return "" as any;
      if (cmdStr.includes("gh pr list")) {
        callCount++;
        if (callCount === 1) return JSON.stringify(fullRange) as any;
        if (callCount === 2) return JSON.stringify(leftHalf) as any;
        if (callCount === 3) return JSON.stringify(rightHalf) as any;
        return "[]" as any;
      }
      return "" as any;
    });

    const result = await listMergedPRs("myorg", "myrepo", "30d");

    // Should have all 1000 unique PRs (deduped overlap)
    expect(result).toHaveLength(1000);
    // Should have made 3 gh pr list calls (full + 2 halves)
    expect(callCount).toBe(3);
  });

  it("throws when gh CLI is not installed", async () => {
    mockExecSync.mockImplementation((cmd: any) => {
      if (String(cmd).includes("gh --version")) throw new Error("not found");
      return "" as any;
    });

    await expect(listMergedPRs("o", "r", "7d")).rejects.toThrow("gh CLI is not installed");
  });
});

describe("fetchPRStats", () => {
  it("fetches diff stats only for the PRs passed to it", async () => {
    const prs: PRListItem[] = [
      { number: 5, title: "PR five", author: "alice", mergedAt: "2026-03-10T12:00:00Z" },
      { number: 8, title: "PR eight", author: "bob", mergedAt: "2026-03-11T12:00:00Z" },
    ];

    // Mock data matches --jq output format (already transformed)
    const commitsFor5 = JSON.stringify([
      { sha: "aaa", author: "alice", message: "feat: stuff" },
      { sha: "bbb", author: "carol", message: "fix: thing" },
    ]);
    const commitsFor8 = JSON.stringify([
      { sha: "ccc", author: "bob", message: "init" },
    ]);

    mockExecSync.mockImplementation((cmd: any) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("/pulls/5/commits")) return commitsFor5 as any;
      if (cmdStr.includes("/pulls/8/commits")) return commitsFor8 as any;
      if (cmdStr.includes("/pulls/5"))
        return JSON.stringify({ additions: 10, deletions: 3 }) as any;
      if (cmdStr.includes("/pulls/8"))
        return JSON.stringify({ additions: 20, deletions: 5 }) as any;
      return "" as any;
    });

    const result = await fetchPRStats("myorg", "myrepo", prs);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      number: 5, title: "PR five", author: "alice",
      additions: 10, deletions: 3, net: 7, total: 13,
    });
    expect(result[0].commits).toHaveLength(2);
    expect(result[0].commits[0].author).toBe("alice");
    expect(result[0].commits[1].author).toBe("carol");
    expect(result[1]).toMatchObject({
      number: 8, title: "PR eight", author: "bob",
      additions: 20, deletions: 5, net: 15, total: 25,
    });
    expect(result[1].commits).toHaveLength(1);
  });

  it("returns empty array when given no PRs", async () => {
    mockExecSync.mockClear();
    const result = await fetchPRStats("o", "r", []);
    expect(result).toEqual([]);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("returns zero stats on API failure", async () => {
    const prs: PRListItem[] = [
      { number: 99, title: "Broken", author: "eve", mergedAt: "2026-03-10T12:00:00Z" },
    ];

    mockExecSync.mockImplementation(() => {
      throw new Error("API error");
    });

    const result = await fetchPRStats("o", "r", prs);
    expect(result[0].additions).toBe(0);
    expect(result[0].deletions).toBe(0);
    expect(result[0].net).toBe(0);
    expect(result[0].total).toBe(0);
    expect(result[0].commits).toEqual([]);
  });
});

describe("cache integration", () => {
  it("only uncached PRs should be passed to fetchPRStats", () => {
    // Simulate the index.ts logic
    const cached: PRStats[] = [
      { number: 1, title: "Cached PR", author: "alice", mergedAt: "2026-03-09T12:00:00Z", additions: 10, deletions: 2, net: 8, total: 12, commits: [] },
      { number: 2, title: "Also cached", author: "bob", mergedAt: "2026-03-10T12:00:00Z", additions: 5, deletions: 1, net: 4, total: 6, commits: [] },
      { number: 3, title: "Old cached", author: "carol", mergedAt: "2026-03-01T12:00:00Z", additions: 100, deletions: 50, net: 50, total: 150, commits: [] },
    ];
    const cachedByNumber = new Map(cached.map((pr) => [pr.number, pr]));

    const listed: PRListItem[] = [
      { number: 1, title: "Cached PR", author: "alice", mergedAt: "2026-03-09T12:00:00Z" },
      { number: 2, title: "Also cached", author: "bob", mergedAt: "2026-03-10T12:00:00Z" },
      { number: 4, title: "New PR", author: "dave", mergedAt: "2026-03-11T12:00:00Z" },
      { number: 5, title: "Another new", author: "eve", mergedAt: "2026-03-12T12:00:00Z" },
    ];

    const uncached = listed.filter((pr) => !cachedByNumber.has(pr.number));
    const cachedInRange = listed
      .filter((pr) => cachedByNumber.has(pr.number))
      .map((pr) => cachedByNumber.get(pr.number)!);

    // Only PRs 4 and 5 should need fetching
    expect(uncached).toHaveLength(2);
    expect(uncached.map((p) => p.number)).toEqual([4, 5]);

    // PRs 1 and 2 are cached and in range; PR 3 is cached but not in the listed range
    expect(cachedInRange).toHaveLength(2);
    expect(cachedInRange.map((p) => p.number)).toEqual([1, 2]);
  });
});
