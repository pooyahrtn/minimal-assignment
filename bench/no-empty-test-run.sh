#!/bin/sh
# `bun test` exits 0 when it collects nothing, which is the exact failure ENGINEERING §3.1
# forbids. Guard it the same way bench/run.ts does.
set -e
bun test "$@"
count=$(git ls-files '*.test.ts' '*.test.tsx' | wc -l | tr -d ' ')
[ "$count" -gt 0 ] || { echo "FAIL: 0 test files collected. A run that checked nothing is not a pass. [ENGINEERING §3.1]" >&2; exit 1; }
echo "$count test files collected."
