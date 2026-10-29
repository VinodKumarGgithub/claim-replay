# Replay report: 2026-11-pgx-fixed

The same release after restoring the metformin quantity limit.

Result: **PASS** – 12 claims changed, all by declared rules; latency within budget

Replayed 5,000 golden claims against **DEMO-COMMERCIAL 2026-11-fixed** (golden results from **DEMO-COMMERCIAL 2026-10**) in 0.1 s, 32 at a time; 2 transient errors retried, 0 failed.

## Outcomes

|  | Golden (current plan) | Candidate |
| --- | ---: | ---: |
| paid | 4,152 | 4,152 |
| rejected | 848 | 848 |

## What changed, by rule

| Rule | Claims changed | Declared in this release? |
| --- | ---: | --- |
| `pgx-cyp2c19` | 12 | yes |

## Examples

| Claim | Rule | Before | After |  |
| --- | --- | --- | --- | --- |
| C0001025 | `pgx-cyp2c19` | PAID $5.00 copay | PAID $5.00 copay + 1 message | expected |
| C0001921 | `pgx-cyp2c19` | PAID $5.00 copay | PAID $5.00 copay + 1 message | expected |
| C0001972 | `pgx-cyp2c19` | PAID $5.00 copay | PAID $5.00 copay + 1 message | expected |
| C0002325 | `pgx-cyp2c19` | PAID $5.00 copay | PAID $5.00 copay + 1 message | expected |
| C0003038 | `pgx-cyp2c19` | PAID $5.00 copay | PAID $5.00 copay + 1 message | expected |
| C0003240 | `pgx-cyp2c19` | PAID $5.00 copay | PAID $5.00 copay + 1 message | expected |

## Latency

|  | Claims | p50 | p95 | p99 | max | Budget (p95) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Whole claim, golden run | 5,000 | 0.03 ms | 0.06 ms | 0.38 ms | 0.41 ms |  |
| Whole claim, candidate | 5,000 | 0 ms | 4.12 ms | 6.15 ms | 12.92 ms | 15 ms |
| Rule `pgx-cyp2c19` (claims it evaluated) | 475 | 4.18 ms | 7.15 ms | 12.59 ms | 12.91 ms | 15 ms |

_Synthetic claims and a demo engine. Latency is measured on the machine that ran the replay._
