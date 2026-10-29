import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Claim, PlanConfig } from "../src/types.ts";
import { compare } from "../src/compare.ts";
import { localEngine } from "../src/engine.ts";
import { GenotypeService, TransientError } from "../src/genotype.ts";
import { runPool } from "../src/pool.ts";

const plan = (name: string): PlanConfig => JSON.parse(readFileSync(new URL(`../configs/${name}.json`, import.meta.url), "utf8"));
const claim = (over: Partial<Claim> = {}): Claim => ({
  claimId: "C1", memberId: "M1", plan: "DEMO-COMMERCIAL", dateOfBirth: "1960-05-01", memberActive: true, drug: "atorvastatin",
  ndc: "99999-0001-01", quantity: 30, daysSupply: 30, fillDate: "2026-09-01", lastFillDate: null, lastDaysSupply: null, priorAuthOnFile: false, ...over,
});

test("a quantity over the plan limit rejects with NCPDP 76", async () => {
  const r = await localEngine(plan("plan-2026-10"), new GenotypeService({})).adjudicate(claim({ drug: "metformin", quantity: 180 }));
  assert.equal(r.status, "REJECTED");
  assert.deepEqual(r.rejectCodes, ["76"]);
});

test("a paid claim is priced as ingredient cost + fee − copay", async () => {
  const r = await localEngine(plan("plan-2026-10"), new GenotypeService({})).adjudicate(claim());
  assert.equal(r.status, "PAID");
  assert.equal(r.patientPayCents, 500);
  assert.equal(r.planPayCents, 30 * 12 + 150 - 500);
});

test("the PGx rule messages poor metabolizers on clopidogrel and leaves everyone else alone", async () => {
  const genotypes = new GenotypeService({ M1: "PM", M2: "NM" });
  const engine = localEngine(plan("plan-2026-11-fixed"), genotypes);
  const pm = await engine.adjudicate(claim({ drug: "clopidogrel" }));
  assert.equal(pm.status, "PAID");
  assert.match(pm.messages[0], /CYP2C19 poor metabolizer/);
  assert.equal((await engine.adjudicate(claim({ memberId: "M2", drug: "clopidogrel" }))).messages.length, 0);
});

test("claims outside the PGx rule's drugs never call the genotype service", async () => {
  const genotypes = new GenotypeService({ M1: "PM" });
  await localEngine(plan("plan-2026-11-fixed"), genotypes).adjudicate(claim({ drug: "lisinopril" }));
  assert.equal(genotypes.calls, 0);
});

test("a new rule that passes is not a change; a declared rule's change is expected; anything else is not", async () => {
  const before = await localEngine(plan("plan-2026-10"), new GenotypeService({ M1: "PM" })).adjudicate(claim({ drug: "clopidogrel" }));
  const passing = await localEngine(plan("plan-2026-11-fixed"), new GenotypeService({ M1: "NM" })).adjudicate(claim({ drug: "clopidogrel" }));
  assert.equal(compare(before, passing, ["pgx-cyp2c19"]), null);
  const messaged = await localEngine(plan("plan-2026-11-fixed"), new GenotypeService({ M1: "PM" })).adjudicate(claim({ drug: "clopidogrel" }));
  assert.equal(compare(before, messaged, ["pgx-cyp2c19"])?.expected, true);
  assert.equal(compare(before, messaged, [])?.expected, false);
});

test("transient errors are retried; other errors are reported, not thrown", async () => {
  const seen = new Map<number, number>();
  const run = await runPool([1, 2, 3], 2, async (n, attempt) => {
    seen.set(n, attempt);
    if (n === 2 && attempt < 2) throw new TransientError("timeout");
    if (n === 3) throw new Error("bad claim");
    return n * 10;
  }, { backoffMs: 1 });
  assert.equal(run.results[1], 20);
  assert.equal(run.retries, 2);
  assert.deepEqual(run.failures.map(f => f.index), [2]);
});
