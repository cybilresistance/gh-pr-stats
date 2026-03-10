export interface Args {
  org: string;
  repo: string;
  last: string;
  noCache: boolean;
}

function printUsage(): never {
  console.log(`Usage: gh-pr-stats --org <org> --repo <repo> --last <duration>

Options:
  --org       GitHub organization or owner (required)
  --repo      Repository name (required)
  --last      Time period, e.g. 30d, 4w, 3m (required)
  --no-cache  Skip cache and fetch fresh data
  --help      Show this help message

Examples:
  gh-pr-stats --org facebook --repo react --last 30d
  gh-pr-stats --org vercel --repo next.js --last 2w --no-cache`);
  process.exit(0);
}

export function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
  }

  let org = "";
  let repo = "";
  let last = "";
  let noCache = false;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--org":
        org = argv[++i] ?? "";
        break;
      case "--repo":
        repo = argv[++i] ?? "";
        break;
      case "--last":
        last = argv[++i] ?? "";
        break;
      case "--no-cache":
        noCache = true;
        break;
    }
  }

  if (!org || !repo || !last) {
    console.error("Error: --org, --repo, and --last are all required.\n");
    printUsage();
  }

  if (!/^\d+[dwm]$/.test(last)) {
    console.error(
      `Error: Invalid --last format "${last}". Use a number followed by d (days), w (weeks), or m (months).`
    );
    process.exit(1);
  }

  return { org, repo, last, noCache };
}

export function parseDuration(last: string): Date {
  const match = last.match(/^(\d+)([dwm])$/);
  if (!match) throw new Error(`Invalid duration: ${last}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();

  switch (unit) {
    case "d":
      now.setDate(now.getDate() - value);
      break;
    case "w":
      now.setDate(now.getDate() - value * 7);
      break;
    case "m":
      now.setMonth(now.getMonth() - value);
      break;
  }

  return now;
}
