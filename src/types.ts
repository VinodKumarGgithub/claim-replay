/** A pharmacy claim, reduced to the fields the demo rules read (loosely modelled on an NCPDP B1 request). */
export interface Claim {
  claimId: string;
  memberId: string;
  plan: string;
  dateOfBirth: string; // YYYY-MM-DD
  memberActive: boolean;
  drug: string; // generic name; the demo's NDCs are made up
  ndc: string;
  quantity: number;
  daysSupply: number;
  fillDate: string;
  lastFillDate: string | null; // from claim history, so every replay is stateless
  lastDaysSupply: number | null;
  priorAuthOnFile: boolean;
}

export type Phenotype = "PM" | "IM" | "NM" | "RM" | "UM"; // CYP2C19 poor … ultrarapid metabolizer

export interface RuleOutcome {
  rule: string;
  result: "pass" | "reject" | "message" | "skip";
  code?: string; // NCPDP reject code, e.g. 76 = Plan Limitations Exceeded
  text?: string;
  ms: number;
}

export interface ClaimResult {
  claimId: string;
  status: "PAID" | "REJECTED";
  rejectCodes: string[];
  messages: string[];
  patientPayCents: number;
  planPayCents: number;
  trace: RuleOutcome[];
  ms: number;
}

export interface Drug { ndc: string; unitCents: number }

export type RuleConfig =
  | { id: string; type: "eligibility" }
  | { id: string; type: "formulary" }
  | { id: string; type: "age"; limits: Record<string, { minAge: number }> }
  | { id: string; type: "quantity"; limits: Record<string, { max: number; days: number }> }
  | { id: string; type: "prior-auth"; drugs: string[] }
  | { id: string; type: "refill"; threshold: number }
  | { id: string; type: "pgx"; gene: "CYP2C19"; drugs: string[]; phenotypes: Phenotype[]; action: "message" | "reject"; text: string };

export interface PlanConfig {
  plan: string;
  version: string;
  drugs: Record<string, Drug>;
  formulary: Record<string, number>; // drug → tier; missing = not on formulary
  copayCents: Record<string, number>; // tier → copay
  dispensingFeeCents: number;
  rules: RuleConfig[];
}

/** One planned change: the candidate plan, the rules it is allowed to change, and its latency budgets. */
export interface Release {
  id: string;
  description: string;
  candidate: string; // path to the candidate PlanConfig
  declaredChanges: string[]; // rule ids whose outcomes may change
  budgets: { claimP95Ms: number; ruleP95Ms: Record<string, number> };
}

/** Anything that can adjudicate a claim: the local demo engine, or a staging endpoint. */
export interface Target {
  name: string;
  adjudicate(claim: Claim): Promise<ClaimResult>;
}
