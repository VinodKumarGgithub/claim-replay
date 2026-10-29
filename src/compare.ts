import type { ClaimResult, RuleOutcome } from "./types.ts";

export interface ClaimDiff {
  claimId: string;
  rules: string[]; // rules whose outcome changed ("pricing" when only the amounts did)
  expected: boolean; // every changed rule was declared in the release
  before: string;
  after: string;
}

const NEUTRAL = new Set(["pass", "skip"]);
const outcome = (o: RuleOutcome | undefined) => (o && !NEUTRAL.has(o.result) ? [o.result, o.code, o.text].filter(Boolean).join(" ") : "ok");
export const describe = (r: ClaimResult) =>
  r.status === "PAID" ? `PAID $${(r.patientPayCents / 100).toFixed(2)} copay${r.messages.length ? ` + ${r.messages.length} message` : ""}`
    : `REJECTED ${r.rejectCodes.join(", ")}`;

/** Rule-by-rule comparison of a candidate result with the golden one. A new rule that passes or skips changes nothing. */
export function compare(before: ClaimResult, after: ClaimResult, declared: string[]): ClaimDiff | null {
  const ids = new Set([...before.trace, ...after.trace].map(o => o.rule));
  const find = (r: ClaimResult, id: string) => r.trace.find(o => o.rule === id);
  const rules = [...ids].filter(id => outcome(find(before, id)) !== outcome(find(after, id)));
  const priced = before.patientPayCents !== after.patientPayCents || before.planPayCents !== after.planPayCents;
  if (!rules.length && !priced && before.status === after.status) return null;
  if (!rules.length) rules.push("pricing");
  return { claimId: before.claimId, rules, expected: rules.every(r => declared.includes(r)), before: describe(before), after: describe(after) };
}
