export interface PRListItem {
  number: number;
  title: string;
  author: string;
  mergedAt: string;
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
}

export interface UserStats {
  author: string;
  prCount: number;
  additions: number;
  deletions: number;
  net: number;
  total: number;
}
