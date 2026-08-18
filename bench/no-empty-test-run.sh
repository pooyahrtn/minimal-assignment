#!/bin/sh
# `bun test` exits 0 when it collects nothing, which is the exact failure ENGINEERING §3.1
# forbids. Guard it the same way bench/run.ts does.
set -e
# Bun's default file walk matches *.spec.ts as well as *.test.ts, which would sweep up the
# Playwright specs under e2e/ and hand them to the wrong runner (T12 hand-off). Scan every
# top-level directory except e2e/ instead of the whole repo.
roots=$(find . -mindepth 1 -maxdepth 1 -type d ! -name e2e ! -name node_modules ! -name '.*' | sed 's|^\./||')
bun test $roots "$@"
count=$(git ls-files '*.test.ts' '*.test.tsx' | wc -l | tr -d ' ')
[ "$count" -gt 0 ] || { echo "FAIL: 0 test files collected. A run that checked nothing is not a pass. [ENGINEERING §3.1]" >&2; exit 1; }
echo "$count test files collected."
