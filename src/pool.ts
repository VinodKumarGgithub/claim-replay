import { TransientError } from "./genotype.ts";

export interface PoolRun<R> { results: R[]; retries: number; failures: { index: number; error: string }[]; ms: number }

/**
 * Runs fn over every item with at most `concurrency` in flight. Transient errors are retried with exponential backoff;
 * anything else, or a transient error that outlasts the retries, is reported as a failure instead of stopping the run.
 */
export async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T, attempt: number) => Promise<R>,
  { retries = 3, backoffMs = 5 } = {}): Promise<PoolRun<R>> {
  const results = new Array<R>(items.length);
  const failures: PoolRun<R>["failures"] = [];
  let next = 0, retried = 0;
  const start = performance.now();
  async function worker() {
    while (next < items.length) {
      const index = next++;
      for (let attempt = 0; ; attempt++) {
        try {
          results[index] = await fn(items[index], attempt);
          break;
        } catch (e) {
          if (e instanceof TransientError && attempt < retries) {
            retried++;
            await new Promise(r => setTimeout(r, backoffMs * 2 ** attempt));
            continue;
          }
          failures.push({ index, error: String(e) });
          break;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { results, retries: retried, failures, ms: performance.now() - start };
}
