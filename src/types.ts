export interface PRListItem {
  number: number;
  title: string;
  author: string;
  mergedAt: string;
  additions: number;
  deletions: number;
}

export interface CommitInfo {
  sha: string;
  author: string;
  message: string;
}

export interface PRStats {
  number: number;
  title: string;
  author: string;
  mergedAt: string;
  additions: number;
  deletions: number;
  net: number;
  total: number;
  commits: CommitInfo[];
  /** True when per-PR commits were actually fetched (see --commits). */
  commitsFetched: boolean;
}

export interface UserStats {
  author: string;
  prCount: number;
  commitCount: number;
  additions: number;
  deletions: number;
  net: number;
  total: number;
}
