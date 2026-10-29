# claim-replay

Replay a golden set of pharmacy claims through a new adjudication rule or plan configuration **before it goes live**.
It shows, rule by rule, which claims would change, fails the release if anything changes that the release didn't
declare, and checks that the new rule stays inside its latency budget.

The demo release adds a pharmacogenomic (PGx) check: a soft message on clopidogrel claims for members with a CYP2C19
poor-metabolizer result on file. While the rule was being added, a quantity-limit row was also edited by mistake. That
kind of slip is easy to miss in review and expensive to find in production. The replay catches it:

```
$ npm run demo
Golden set: 5000 claims through DEMO-COMMERCIAL 2026-10 → golden/ ({"PAID":4152,"REJECTED":848})
2026-11-pgx: BLOCKED – 208 claims changed (196 unexpected), claim p95 0.06 → 4.12 ms, 2 retries, 0 failed.
2026-11-pgx-fixed: PASS – 12 claims changed (0 unexpected), claim p95 0.06 → 4.12 ms, 2 retries, 0 failed.
```

| Rule | Claims changed | Declared in this release? |
| --- | ---: | --- |
| `quantity-limit` | 196 | **no – unexpected** (metformin limit 150 → 120 per 30 days) |
| `pgx-cyp2c19` | 12 | yes |

Full reports: [blocked release](examples/report-blocked.md) · [fixed release](examples/report-pass.md)

Why I built it, and a 3-week pilot: [one-page brief for RxSense](docs/rxsense-brief.pdf)

## Run it

Node.js 22.18 or newer runs the TypeScript directly. There is nothing to install or build.

```
npm run demo     # record the golden set, replay the faulty release (blocked), replay the fixed one (passes)
npm test         # unit tests
```

## How it works

1. **Golden set** (`record`). Claims are adjudicated once by the current plan, and the results are saved as the
   expected answers. Each claim carries the history it needs, such as the last fill date for refill-too-soon. That makes
   every replay stateless and repeatable.
2. **Release manifest** (`releases/*.json`). This names the candidate configuration, the rules it is *allowed* to change,
   and the latency budgets:
   ```json
   { "id": "2026-11-pgx", "candidate": "../configs/plan-2026-11.json",
     "declaredChanges": ["pgx-cyp2c19"], "budgets": { "claimP95Ms": 15, "ruleP95Ms": { "pgx-cyp2c19": 15 } } }
   ```
3. **Replay** (`replay`). Every golden claim runs through the candidate with bounded concurrency. Transient errors from
   dependencies, such as the genotype lookup, are retried with backoff. A claim that still fails is reported instead of
   stopping the run.
4. **Rule-level diff.** Each rule's outcome is compared, not just paid/rejected. A new rule that passes or skips counts
   as no change. A changed claim is *expected* only if every rule that changed it is declared in the manifest.
5. **Gate.** The run exits with code 1 on an undeclared change, a broken latency budget or a failed claim, so CI can
   block the merge (`.github/workflows/replay.yml`). It writes a Markdown report and a JSON report.

The demo engine (`src/engine.ts`, `src/rules.ts`) runs eligibility, formulary, age limit, quantity limit, prior
authorization, refill too soon, and the new PGx rule. It returns NCPDP reject codes (65, MR, 60, 76, 75, 79, 88) and
times every rule. The genotype service is simulated with a few milliseconds of latency, occasional timeouts and a
per-member cache. Claims for other drugs never pay for the lookup.

## Pointing it at a real engine

The harness only needs something that takes a claim and returns a result:

```ts
interface Target { name: string; adjudicate(claim: Claim): Promise<ClaimResult> }
```

`httpTarget(url)` in `src/engine.ts` does that against a staging endpoint. In practice you would:
- record the golden set from de-identified production claims;
- map the engine's response to `ClaimResult`, including a per-rule trace if the engine can return one;
- keep one manifest per release.

## Limits

- All claims and members are synthetic. The drug names are real generics; the NDCs and prices are made up.
- The engine is a teaching model, not a full NCPDP implementation.
- Latency is measured on the machine running the replay. Budgets belong to a staging environment.
- The PGx message text follows the CPIC guidance for clopidogrel, but it is an example, not clinical advice.

Built by [Vinod Kumar G](https://imvinod.com). I lead a team running a Pharmacy Benefit Management platform at 1M+
transactions a day. MIT licensed.
