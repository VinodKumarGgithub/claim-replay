import type { ClaimDiff } from "./compare.ts";
import type { Latency } from "./stats.ts";
import type { Release } from "./types.ts";

export interface ReplaySummary {
  release: Release;
  baseline: string;
  candidate: string;
  claims: number;
  seconds: number;
  concurrency: number;
  retries: number;
  failures: { claimId: string; error: string }[];
  outcomes: { before: Record<string, number>; after: Record<string, number> };
  diffs: ClaimDiff[];
  claimLatency: { before: Latency; after: Latency };
  ruleLatency: Record<string, Latency>;
  budgetBreaches: string[];
  blocked: boolean;
}

const n = (x: number) => x.toLocaleString("en-US");
const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;

export function markdown(s: ReplaySummary): string {
  const unexpected = s.diffs.filter(d => !d.expected);
  const byRule = new Map<string, number>();
  for (const d of s.diffs) for (const r of d.rules) byRule.set(r, (byRule.get(r) ?? 0) + 1);
  const verdict = s.blocked
    ? `**BLOCKED** – ${[unexpected.length && `${n(unexpected.length)} claims changed in ways this release didn't declare`, ...s.budgetBreaches,
        s.failures.length && `${s.failures.length} claims failed to replay`].filter(Boolean).join("; ")}`
    : `**PASS** – ${n(s.diffs.length)} claims changed, all by declared rules; latency within budget`;
  const lines = [
    `# Replay report: ${s.release.id}`,
    "",
    `${s.release.description}`,
    "",
    `Result: ${verdict}`,
    "",
    `Replayed ${n(s.claims)} golden claims against **${s.candidate}** (golden results from **${s.baseline}**) in ${s.seconds.toFixed(1)} s, ` +
      `${s.concurrency} at a time; ${n(s.retries)} transient errors retried, ${s.failures.length} failed.`,
    "",
    "## Outcomes",
    "",
    row(["", "Golden (current plan)", "Candidate"]), row(["---", "---:", "---:"]),
    ...["PAID", "REJECTED"].map(k => row([k.toLowerCase(), n(s.outcomes.before[k] ?? 0), n(s.outcomes.after[k] ?? 0)])),
    "",
    "## What changed, by rule",
    "",
    row(["Rule", "Claims changed", "Declared in this release?"]), row(["---", "---:", "---"]),
    ...[...byRule].sort((a, b) => b[1] - a[1]).map(([r, c]) => row([`\`${r}\``, n(c), s.release.declaredChanges.includes(r) ? "yes" : "**no – unexpected**"])),
  ];
  if (!byRule.size) lines.push(row(["(none)", 0, ""]));
  const examples = [...unexpected.slice(0, 8), ...s.diffs.filter(d => d.expected).slice(0, unexpected.length ? 3 : 6)];
  if (examples.length) {
    lines.push("", "## Examples", "", row(["Claim", "Rule", "Before", "After", ""]), row(["---", "---", "---", "---", "---"]),
      ...examples.map(d => row([d.claimId, d.rules.map(r => `\`${r}\``).join(", "), d.before, d.after, d.expected ? "expected" : "**unexpected**"])));
  }
  const ms = (l: Latency) => [l.p50, l.p95, l.p99, l.max].map(v => (v < 0.01 ? "<0.01 ms" : `${v} ms`));
  lines.push("", "## Latency", "", row(["", "Claims", "p50", "p95", "p99", "max", "Budget (p95)"]), row(["---", "---:", "---:", "---:", "---:", "---:", "---:"]),
    row(["Whole claim, golden run", n(s.claimLatency.before.n), ...ms(s.claimLatency.before), ""]),
    row(["Whole claim, candidate", n(s.claimLatency.after.n), ...ms(s.claimLatency.after), `${s.release.budgets.claimP95Ms} ms`]),
    ...Object.entries(s.ruleLatency).map(([r, l]) => row([`Rule \`${r}\` (claims it evaluated)`, n(l.n), ...ms(l),
      s.release.budgets.ruleP95Ms[r] ? `${s.release.budgets.ruleP95Ms[r]} ms` : ""])));
  if (s.failures.length) lines.push("", "## Failed to replay", "", ...s.failures.slice(0, 10).map(f => `- ${f.claimId}: ${f.error}`));
  lines.push("", "_Synthetic claims and a demo engine. Latency is measured on the machine that ran the replay._", "");
  return lines.join("\n");
}
