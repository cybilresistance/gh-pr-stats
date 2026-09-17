import type { UserStats } from "./types.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function colorNet(n: number, width: number = 0): string {
  const sign = n >= 0 ? "+" : "";
  const raw = `${sign}${fmt(n)}`;
  const padded = width > 0 ? raw.padStart(width) : raw;
  const color = n >= 0 ? GREEN : RED;
  return `${color}${padded}${RESET}`;
}

function pad(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + "\u2026" : s.padEnd(len);
}

function rpad(s: string, len: number): string {
  return s.padStart(len);
}

function colorPad(s: string, len: number, color: string): string {
  return `${color}${s.padStart(len)}${RESET}`;
}

export function printHeader(org: string, repo: string, last: string): void {
  const line = "\u2500".repeat(60);
  console.log(`\n${BOLD}PR Stats: ${org}/${repo} (last ${last})${RESET}`);
  console.log(DIM + line + RESET);
}

function printUserTable(title: string, users: UserStats[], showCommits: boolean): void {
  console.log(`\n${BOLD}${title}${RESET}\n`);

  const totals = { prs: 0, commits: 0, add: 0, del: 0, net: 0, total: 0 };

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const rank = `${DIM}${String(i + 1).padStart(3)}.${RESET}`;
    const author = pad(`@${u.author}`, 20);
    const prs = rpad(`${u.prCount} PRs`, 8);
    const commits = showCommits ? ` ${rpad(`${u.commitCount}c`, 5)}` : "";
    const add = colorPad(`+${fmt(u.additions)}`, 10, GREEN);
    const del = colorPad(`-${fmt(u.deletions)}`, 10, RED);
    const net = colorNet(u.net, 10);
    const total = rpad(fmt(u.total), 8);

    console.log(`  ${rank} ${author} ${prs}${commits}  ${add}  ${del}  net ${net}  tot ${BOLD}${total}${RESET}`);

    totals.prs += u.prCount;
    totals.commits += u.commitCount;
    totals.add += u.additions;
    totals.del += u.deletions;
    totals.net += u.net;
    totals.total += u.total;
  }

  const line = "\u2500".repeat(65);
  console.log(`  ${DIM}${line}${RESET}`);
  const rankSpacer = "     ";
  const label = pad("Total", 20);
  const prs = rpad(`${totals.prs} PRs`, 8);
  const commits = showCommits ? ` ${rpad(`${totals.commits}c`, 5)}` : "";
  const add = colorPad(`+${fmt(totals.add)}`, 10, GREEN);
  const del = colorPad(`-${fmt(totals.del)}`, 10, RED);
  const net = colorNet(totals.net, 10);
  const total = rpad(fmt(totals.total), 8);
  console.log(`  ${rankSpacer} ${BOLD}${label}${RESET} ${prs}${commits}  ${add}  ${del}  net ${net}  tot ${BOLD}${total}${RESET}\n`);
}

export function printUserSummary(users: UserStats[], showCommits: boolean = false): void {
  // First table: current order (by total lines changed)
  printUserTable("User Summary (by total lines changed)", users, showCommits);

  // Second table: sorted by number of PRs descending
  const byPRCount = [...users].sort((a, b) => b.prCount - a.prCount || b.total - a.total);
  printUserTable("User Summary (by PR count)", byPRCount, showCommits);
}
