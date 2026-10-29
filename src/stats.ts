export interface Latency { n: number; p50: number; p95: number; p99: number; max: number }

export function latency(values: number[]): Latency {
  const v = [...values].sort((a, b) => a - b);
  const at = (q: number) => (v.length ? v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)] : 0);
  const r = (x: number) => Math.round(x * 100) / 100;
  return { n: v.length, p50: r(at(0.5)), p95: r(at(0.95)), p99: r(at(0.99)), max: r(v[v.length - 1] ?? 0) };
}
