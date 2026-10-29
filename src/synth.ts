import type { Claim, Phenotype } from "./types.ts";
import { mulberry32 } from "./random.ts";

/** Synthetic members and claims (no real people, no real data). Drug names are real generics; NDCs are made up. */
const DRUGS: [drug: string, weight: number, perMonth: number[]][] = [
  ["atorvastatin", 18, [30]],
  ["metformin", 16, [60, 90, 120, 150]],
  ["lisinopril", 14, [30]],
  ["omeprazole", 10, [30, 60]],
  ["sertraline", 10, [30]],
  ["clopidogrel", 10, [30]],
  ["apixaban", 7, [60]],
  ["semaglutide", 6, [1]],
  ["tramadol", 5, [30, 60, 120]],
  ["esomeprazole-brand", 4, [30]],
];
const PHENOTYPES: [Phenotype, number][] = [["PM", 0.1], ["IM", 0.3], ["NM", 0.4], ["RM", 0.15], ["UM", 0.05]];

export function synthesize(nClaims: number, seed = 20261030) {
  const rnd = mulberry32(seed);
  const pick = <T>(items: [T, number, ...unknown[]][]): T => {
    let r = rnd() * items.reduce((s, i) => s + i[1], 0);
    for (const item of items) if ((r -= item[1]) < 0) return item[0];
    return items[items.length - 1][0];
  };
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const nMembers = Math.ceil(nClaims * 0.3);
  const members = Array.from({ length: nMembers }, (_, i) => ({
    memberId: `M${String(i + 1).padStart(6, "0")}`,
    dateOfBirth: iso(Date.UTC(1936, 0, 1) + rnd() * 85 * 365.25 * 86_400_000),
    memberActive: rnd() > 0.02,
  }));
  const genotypes: Record<string, Phenotype> = {};
  for (const m of members) if (rnd() < 0.25) genotypes[m.memberId] = pick(PHENOTYPES); // a quarter have a PGx test on file

  const start = Date.UTC(2026, 7, 1);
  const claims: Claim[] = Array.from({ length: nClaims }, (_, i) => {
    const m = members[Math.floor(rnd() * nMembers)];
    const drug = pick(DRUGS.map(([d, w]) => [d, w] as [string, number]));
    const options = DRUGS.find(d => d[0] === drug)![2];
    const daysSupply = drug === "semaglutide" ? 28 : rnd() < 0.8 ? 30 : 90;
    const perMonth = options[Math.floor(rnd() * options.length)];
    const fill = start + Math.floor(rnd() * 90) * 86_400_000;
    const hasHistory = rnd() < 0.4;
    return {
      claimId: `C${String(i + 1).padStart(7, "0")}`,
      memberId: m.memberId,
      plan: "DEMO-COMMERCIAL",
      dateOfBirth: m.dateOfBirth,
      memberActive: m.memberActive,
      drug,
      ndc: `99999-${String(DRUGS.findIndex(d => d[0] === drug) + 1).padStart(4, "0")}-01`,
      quantity: drug === "semaglutide" ? 1 : Math.round((perMonth * daysSupply) / 30),
      daysSupply,
      fillDate: iso(fill),
      lastFillDate: hasHistory ? iso(fill - Math.round(daysSupply * (0.7 + rnd() * 0.5)) * 86_400_000) : null,
      lastDaysSupply: hasHistory ? daysSupply : null,
      priorAuthOnFile: rnd() < 0.6,
    };
  });
  return { claims, genotypes };
}
