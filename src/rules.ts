import type { Claim, PlanConfig, RuleConfig, RuleOutcome } from "./types.ts";
import type { GenotypeService } from "./genotype.ts";

type Verdict = Omit<RuleOutcome, "rule" | "ms">;
export type Rule = (claim: Claim, plan: PlanConfig, attempt: number) => Promise<Verdict> | Verdict;

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const age = (dob: string, on: string) => Math.floor(days(dob, on) / 365.25);
const PASS: Verdict = { result: "pass" };
const SKIP: Verdict = { result: "skip" };

/** Each rule type, configured from the plan. Reject codes follow NCPDP Telecommunication reject codes. */
export function buildRule(cfg: RuleConfig, genotypes: GenotypeService): Rule {
  switch (cfg.type) {
    case "eligibility":
      return c => (c.memberActive ? PASS : { result: "reject", code: "65", text: "Patient is not covered" });
    case "formulary":
      return (c, plan) => (c.drug in plan.formulary ? PASS : { result: "reject", code: "MR", text: "Product not on formulary" });
    case "age":
      return c => {
        const limit = cfg.limits[c.drug];
        if (!limit) return SKIP;
        return age(c.dateOfBirth, c.fillDate) >= limit.minAge ? PASS
          : { result: "reject", code: "60", text: `Not covered under age ${limit.minAge}` };
      };
    case "quantity":
      return c => {
        const limit = cfg.limits[c.drug];
        if (!limit) return SKIP;
        const allowed = Math.floor((limit.max * c.daysSupply) / limit.days);
        return c.quantity <= allowed ? PASS
          : { result: "reject", code: "76", text: `Plan limit: ${limit.max} per ${limit.days} days` };
      };
    case "prior-auth":
      return c => (!cfg.drugs.includes(c.drug) ? SKIP : c.priorAuthOnFile ? PASS
        : { result: "reject", code: "75", text: "Prior authorization required" });
    case "refill":
      return c => {
        if (!c.lastFillDate || !c.lastDaysSupply) return SKIP;
        const earliest = Math.ceil(c.lastDaysSupply * cfg.threshold);
        return days(c.lastFillDate, c.fillDate) >= earliest ? PASS
          : { result: "reject", code: "79", text: `Refill too soon: next fill on day ${earliest}` };
      };
    case "pgx":
      return async (c, _plan, attempt) => {
        if (!cfg.drugs.includes(c.drug)) return SKIP; // only claims in scope pay for the lookup
        const phenotype = await genotypes.lookup(c.memberId, attempt);
        if (!phenotype || !cfg.phenotypes.includes(phenotype)) return PASS;
        return cfg.action === "reject" ? { result: "reject", code: "88", text: cfg.text } : { result: "message", text: cfg.text };
      };
  }
}
