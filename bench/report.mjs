// Turns bench/results/*.json (k6 summaries) into the markdown table of the README.
import { readFileSync, writeFileSync } from 'node:fs';

const rows = [];
for (const lines of [1, 5, 10, 20]) {
  for (const mode of ['per-line', 'aggregated']) {
    const s = JSON.parse(readFileSync(`bench/results/${mode}-${lines}.json`, 'utf8'));
    const m = s.metrics;
    const seconds = s.state.testRunDurationMs / 1000;
    rows.push({
      lines,
      mode,
      // The setup() requests (one POST per line) are not part of a cart view.
      requestsPerRender: (m.http_reqs.values.count - lines) / m.cart_renders.values.count,
      rendersPerSecond: m.cart_renders.values.count / seconds,
      med: m.cart_render_ms.values.med,
      p95: m.cart_render_ms.values['p(95)'],
      failed: m.http_req_failed.values.rate,
    });
  }
}

const fmt = (n, d = 1) => n.toFixed(d);
const table = [
  '| Cart lines | Strategy | HTTP requests / cart view | Cart views / s | Median (ms) | p95 (ms) | Errors |',
  '|---:|---|---:|---:|---:|---:|---:|',
  ...rows.map(
    (r) =>
      `| ${r.lines} | ${r.mode} | ${fmt(r.requestsPerRender)} | ${fmt(r.rendersPerSecond, 0)} | ${fmt(r.med)} | ${fmt(r.p95)} | ${fmt(r.failed * 100, 2)}% |`,
  ),
].join('\n');

writeFileSync('bench/results/summary.md', `${table}\n`);
console.log(table);
