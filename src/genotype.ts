import type { Phenotype } from "./types.ts";
import { hashUnit } from "./random.ts";

export class TransientError extends Error {}

/**
 * A stand-in for an external pharmacogenomics lookup (a lab or PGx partner API).
 * It answers in a few milliseconds, sometimes slowly, and fails about 1 call in 200 with a transient error,
 * so the replay has to cope with latency and retries the way it would against a real dependency.
 * Results are cached per member: a genotype doesn't change between claims.
 */
export class GenotypeService {
  calls = 0;
  private cache = new Map<string, Phenotype | null>();
  private onFile: Map<string, Phenotype>;

  constructor(onFile: Record<string, Phenotype>) {
    this.onFile = new Map(Object.entries(onFile));
  }

  async lookup(memberId: string, attempt = 0): Promise<Phenotype | null> {
    const hit = this.cache.get(memberId);
    if (hit !== undefined) return hit;
    this.calls++;
    const r = hashUnit(`${memberId}:${attempt}`);
    await new Promise(resolve => setTimeout(resolve, r < 0.05 ? 12 : 2 + Math.floor(r * 5)));
    if (r > 0.995) throw new TransientError(`genotype service timeout for ${memberId}`);
    const phenotype = this.onFile.get(memberId) ?? null;
    this.cache.set(memberId, phenotype);
    return phenotype;
  }
}
