import type { PRStats, UserStats } from "./types.js";

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

export function printPRTable(prs: PRStats[]): void {
  console.log(`\n${BOLD}Merged PRs (${prs.length})${RESET}\n`);

  for (const pr of prs) {
    const num = `#${pr.number}`.padEnd(7);
    const title = pad(pr.title, 40);
    const author = pad(`@${pr.author}`, 18);
    const add = colorPad(`+${fmt(pr.additions)}`, 10, GREEN);
    const del = colorPad(`-${fmt(pr.deletions)}`, 10, RED);
    const net = colorNet(pr.net, 10);
    const total = rpad(fmt(pr.total), 8);

    console.log(`  ${DIM}${num}${RESET} ${title} ${author} ${add}  ${del}  net ${net}  tot ${BOLD}${total}${RESET}`);
  }
}

export function printUserSummary(users: UserStats[]): void {
  console.log(`\n${BOLD}User Summary${RESET}\n`);

  const totals = { prs: 0, add: 0, del: 0, net: 0, total: 0 };

  for (const u of users) {
    const author = pad(`@${u.author}`, 20);
    const prs = rpad(`${u.prCount} PRs`, 8);
    const add = colorPad(`+${fmt(u.additions)}`, 10, GREEN);
    const del = colorPad(`-${fmt(u.deletions)}`, 10, RED);
    const net = colorNet(u.net, 10);
    const total = rpad(fmt(u.total), 8);

    console.log(`  ${author} ${prs}  ${add}  ${del}  net ${net}  tot ${BOLD}${total}${RESET}`);

    totals.prs += u.prCount;
    totals.add += u.additions;
    totals.del += u.deletions;
    totals.net += u.net;
    totals.total += u.total;
  }

  const line = "\u2500".repeat(60);
  console.log(`  ${DIM}${line}${RESET}`);
  const label = pad("Total", 20);
  const prs = rpad(`${totals.prs} PRs`, 8);
  const add = colorPad(`+${fmt(totals.add)}`, 10, GREEN);
  const del = colorPad(`-${fmt(totals.del)}`, 10, RED);
  const net = colorNet(totals.net, 10);
  const total = rpad(fmt(totals.total), 8);
  console.log(`  ${BOLD}${label}${RESET} ${prs}  ${add}  ${del}  net ${net}  tot ${BOLD}${total}${RESET}\n`);
}
