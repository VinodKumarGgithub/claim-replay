import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Claim, ClaimResult, PlanConfig, Release } from "./types.ts";
import { compare } from "./compare.ts";
import { localEngine } from "./engine.ts";
import { GenotypeService } from "./genotype.ts";
import { runPool } from "./pool.ts";
import { markdown, type ReplaySummary } from "./report.ts";
import { latency } from "./stats.ts";
import { synthesize } from "./synth.ts";

const { positionals, values: opt } = parseArgs({
  allowPositionals: true,
  options: { plan: { type: "string" }, claims: { type: "string", default: "5000" }, out: { type: "string" }, release: { type: "string" },
    golden: { type: "string", default: "golden" }, concurrency: { type: "string", default: "32" } },
});
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8"));
const readLines = <T>(path: string): T[] => readFileSync(path, "utf8").trim().split("\n").map(l => JSON.parse(l));
const writeLines = (path: string, rows: unknown[]) => writeFileSync(path, rows.map(r => JSON.stringify(r)).join("\n") + "\n");
const concurrency = Number(opt.concurrency);
const count = (results: ClaimResult[]) => results.reduce<Record<string, number>>((c, r) => ((c[r.status] = (c[r.status] ?? 0) + 1), c), {});
const untimed = (r: ClaimResult): ClaimResult => ({ ...r, trace: r.trace.map(o => ({ ...o, ms: 0 })), ms: 0 });

async function adjudicateAll(plan: PlanConfig, claims: Claim[], genotypes: Record<string, any>) {
  const engine = localEngine(plan, new GenotypeService(genotypes));
  return { engine, run: await runPool(claims, concurrency, (c, attempt) => engine.adjudicateAttempt(c, attempt)) };
}

/** record: make the golden set – synthetic claims and the current plan's results for them. */
async function record() {
  const plan = readJson<PlanConfig>(opt.plan!);
  const { claims, genotypes } = synthesize(Number(opt.claims));
  const { engine, run } = await adjudicateAll(plan, claims, genotypes);
  if (run.failures.length) throw new Error(`${run.failures.length} claims failed while recording the golden set`);
  mkdirSync(opt.out!, { recursive: true });
  writeLines(join(opt.out!, "claims.jsonl"), claims);
  writeLines(join(opt.out!, "expected.jsonl"), run.results.map(untimed));
  writeFileSync(join(opt.out!, "genotypes.json"), JSON.stringify(genotypes));
  writeFileSync(join(opt.out!, "meta.json"), JSON.stringify({ plan: engine.name, claims: claims.length, claimLatency: latency(run.results.map(r => r.ms)) }, null, 2));
  console.log(`Golden set: ${claims.length} claims through ${engine.name} → ${opt.out}/ (${JSON.stringify(count(run.results))})`);
}

/** replay: run the release's candidate plan over the golden set, compare rule by rule, check latency budgets. */
async function replay() {
  const release = readJson<Release>(opt.release!);
  const candidate = readJson<PlanConfig>(resolve(dirname(opt.release!), release.candidate));
  const claims = readLines<Claim>(join(opt.golden, "claims.jsonl"));
  const expected = readLines<ClaimResult>(join(opt.golden, "expected.jsonl"));
  const meta = readJson<{ plan: string; claimLatency: ReplaySummary["claimLatency"]["before"] }>(join(opt.golden, "meta.json"));
  const { engine, run } = await adjudicateAll(candidate, claims, readJson(join(opt.golden, "genotypes.json")));
  const done = run.results.map((r, i) => [expected[i], r] as const).filter(([, r]) => r);
  const diffs = done.map(([before, after]) => compare(before, after, release.declaredChanges)).filter(d => d !== null);
  const ruleLatency: ReplaySummary["ruleLatency"] = {};
  for (const id of Object.keys(release.budgets.ruleP95Ms)) {
    ruleLatency[id] = latency(done.flatMap(([, r]) => r.trace.filter(o => o.rule === id && o.result !== "skip").map(o => o.ms)));
  }
  const claimLatency = { before: meta.claimLatency, after: latency(done.map(([, r]) => r.ms)) };
  const budgetBreaches = [
    claimLatency.after.p95 > release.budgets.claimP95Ms && `claim p95 ${claimLatency.after.p95} ms is over the ${release.budgets.claimP95Ms} ms budget`,
    ...Object.entries(release.budgets.ruleP95Ms).map(([id, max]) => ruleLatency[id].p95 > max && `rule ${id} p95 ${ruleLatency[id].p95} ms is over the ${max} ms budget`),
  ].filter((x): x is string => Boolean(x));
  const summary: ReplaySummary = {
    release, baseline: meta.plan, candidate: engine.name, claims: claims.length, seconds: run.ms / 1000, concurrency, retries: run.retries,
    failures: run.failures.map(f => ({ claimId: claims[f.index].claimId, error: f.error })),
    outcomes: { before: count(expected), after: count(done.map(([, r]) => r)) },
    diffs, claimLatency, ruleLatency, budgetBreaches,
    blocked: diffs.some(d => !d.expected) || budgetBreaches.length > 0 || run.failures.length > 0,
  };
  mkdirSync(opt.out ?? "reports", { recursive: true });
  const base = join(opt.out ?? "reports", release.id);
  writeFileSync(`${base}.md`, markdown(summary));
  writeFileSync(`${base}.json`, JSON.stringify(summary, null, 2));
  const unexpected = diffs.filter(d => !d.expected).length;
  console.log(`${release.id}: ${summary.blocked ? "BLOCKED" : "PASS"} – ${diffs.length} claims changed (${unexpected} unexpected), ` +
    `claim p95 ${claimLatency.before.p95} → ${claimLatency.after.p95} ms, ${run.retries} retries, ${run.failures.length} failed. Report: ${base}.md`);
  process.exitCode = summary.blocked ? 1 : 0;
}

const command = positionals[0];
if (command === "record") await record();
else if (command === "replay") await replay();
else {
  console.error("usage: node src/cli.ts record --plan PLAN.json [--claims N] --out DIR\n       node src/cli.ts replay --release RELEASE.json [--golden DIR] [--out DIR]");
  process.exitCode = 2;
}
