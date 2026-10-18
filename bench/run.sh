#!/usr/bin/env bash
# Runs every benchmark combination against a running stack and writes bench/results/*.json.
# Start the stack first, e.g.: RATE_LIMIT_MAX=1000000 CHAOS_ERROR_RATE=0 npm start
set -euo pipefail
cd "$(dirname "$0")/.."

K6=${K6:-k6}
for lines in 1 5 10 20; do
  for mode in per-line aggregated; do
    echo "== $mode, $lines line(s)"
    "$K6" run --quiet -e MODE="$mode" -e LINES="$lines" bench/cart.js > /dev/null
  done
done
node bench/report.mjs
