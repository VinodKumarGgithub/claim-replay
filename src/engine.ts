import type { Claim, ClaimResult, PlanConfig, RuleOutcome, Target } from "./types.ts";
import { GenotypeService } from "./genotype.ts";
import { buildRule } from "./rules.ts";

/**
 * A small adjudication engine for the demo: runs every configured rule in order (so a claim can carry several reject
 * codes, as real responses do), times each rule, and prices paid claims as ingredient cost + dispensing fee − copay.
 */
export function localEngine(plan: PlanConfig, genotypes: GenotypeService): Target & { adjudicateAttempt(c: Claim, attempt: number): Promise<ClaimResult> } {
  const rules = plan.rules.map(cfg => ({ id: cfg.id, run: buildRule(cfg, genotypes) }));
  async function adjudicateAttempt(claim: Claim, attempt: number): Promise<ClaimResult> {
    const start = performance.now();
    const trace: RuleOutcome[] = [];
    for (const rule of rules) {
      const t0 = performance.now();
      const verdict = await rule.run(claim, plan, attempt);
      trace.push({ rule: rule.id, ...verdict, ms: performance.now() - t0 });
    }
    const rejectCodes = trace.filter(o => o.result === "reject").map(o => o.code!);
    const messages = trace.filter(o => o.result === "message").map(o => o.text!);
    let patientPayCents = 0, planPayCents = 0;
    if (!rejectCodes.length) {
      const drug = plan.drugs[claim.drug];
      const gross = drug.unitCents * claim.quantity + plan.dispensingFeeCents;
      patientPayCents = Math.min(gross, plan.copayCents[String(plan.formulary[claim.drug])] ?? gross);
      planPayCents = gross - patientPayCents;
    }
    return { claimId: claim.claimId, status: rejectCodes.length ? "REJECTED" : "PAID", rejectCodes, messages,
      patientPayCents, planPayCents, trace, ms: performance.now() - start };
  }
  return { name: `${plan.plan} ${plan.version}`, adjudicate: c => adjudicateAttempt(c, 0), adjudicateAttempt };
}

/** The same contract against a staging adjudication endpoint that accepts a claim as JSON and answers a ClaimResult. */
export function httpTarget(url: string, headers: Record<string, string> = {}): Target {
  return {
    name: url,
    async adjudicate(claim) {
      const start = performance.now();
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(claim) });
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      return { ...(await res.json()) as ClaimResult, ms: performance.now() - start };
    },
  };
}
