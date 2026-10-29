# Replay report: 2026-11-pgx

Adds a CYP2C19 pharmacogenomic check to clopidogrel claims (soft message, claim still pays). Nothing else should change.

Result: **BLOCKED** – 196 claims changed in ways this release didn't declare

Replayed 5,000 golden claims against **DEMO-COMMERCIAL 2026-11** (golden results from **DEMO-COMMERCIAL 2026-10**) in 0.1 s, 32 at a time; 2 transient errors retried, 0 failed.

## Outcomes

|  | Golden (current plan) | Candidate |
| --- | ---: | ---: |
| paid | 4,152 | 3,972 |
| rejected | 848 | 1,028 |

## What changed, by rule

| Rule | Claims changed | Declared in this release? |
| --- | ---: | --- |
| `quantity-limit` | 196 | **no – unexpected** |
| `pgx-cyp2c19` | 12 | yes |

## Examples

| Claim | Rule | Before | After |  |
| --- | --- | --- | --- | --- |
| C0000005 | `quantity-limit` | PAID $5.00 copay | REJECTED 76 | **unexpected** |
| C0000103 | `quantity-limit` | PAID $5.00 copay | REJECTED 76 | **unexpected** |
| C0000136 | `quantity-limit` | PAID $5.00 copay | REJECTED 76 | **unexpected** |
| C0000151 | `quantity-limit` | PAID $5.00 copay | REJECTED 76 | **unexpected** |
| C0000162 | `quantity-limit` | PAID $5.00 copay | REJECTED 76 | **unexpected** |
| C0000186 | `quantity-limit` | REJECTED 79 | REJECTED 76, 79 | **unexpected** |
| C0000209 | `quantity-limit` | PAID $5.00 copay | REJECTED 76 | **unexpected** |
| C0000216 | `quantity-limit` | PAID $5.00 copay | REJECTED 76 | **unexpected** |
| C0001025 | `pgx-cyp2c19` | PAID $5.00 copay | PAID $5.00 copay + 1 message | expected |
| C0001921 | `pgx-cyp2c19` | PAID $5.00 copay | PAID $5.00 copay + 1 message | expected |
| C0001972 | `pgx-cyp2c19` | PAID $5.00 copay | PAID $5.00 copay + 1 message | expected |

## Latency

|  | Claims | p50 | p95 | p99 | max | Budget (p95) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Whole claim, golden run | 5,000 | 0.03 ms | 0.06 ms | 0.38 ms | 0.41 ms |  |
| Whole claim, candidate | 5,000 | 0 ms | 4.12 ms | 5.96 ms | 13.14 ms | 15 ms |
| Rule `pgx-cyp2c19` (claims it evaluated) | 475 | 4.18 ms | 7.1 ms | 12.77 ms | 13.14 ms | 15 ms |

_Synthetic claims and a demo engine. Latency is measured on the machine that ran the replay._
