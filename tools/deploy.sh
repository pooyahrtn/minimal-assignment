#!/bin/bash
# T15 — deploy the three projects, then prove the deployment from outside it.
#
# Every project setting Vercel holds in dashboard state is set here as a command, because a deploy
# that only works if someone remembers which checkbox they ticked is not reproducible from a clean
# clone [ENGINEERING §3.4]. Re-running this is safe and idempotent.
#
#   bun run tools/deploy.sh          # build, deploy, verify
#   bun run tools/deploy.sh verify   # verify the live deployments only
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM=https://maximal-platform.vercel.app
VELDE=https://maximal-velde.vercel.app
KRACHT=https://maximal-kracht.vercel.app

fail() { echo "FAIL: $*" >&2; exit 1; }

deploy() {
  # The two Bun servers become static output: their routes are pure functions of committed JSON
  # plus files, and `apps/platform/server.ts:103` rebuilds the bundle by shelling out to `bun
  # build`, which no serverless host can do. See tools/build-platform.ts for the full reasoning.
  bun run tools/build-platform.ts
  bunx vercel deploy dist/platform --prod --yes --project maximal-platform

  bun run tools/build-velde.ts --site="$VELDE" --platform="$PLATFORM"
  bunx vercel deploy dist/velde --prod --yes --project maximal-velde

  # KRACHT is the only one Vercel builds itself. Two settings it cannot infer:
  #  - root-directory, so `next build` runs in the app; the deploy still uploads from the REPO ROOT
  #    so that `apps/shop-kracht/public/photos` (a symlink to ../../assets/photos/kracht) has a
  #    target at all. Deploying with --cwd instead uploads only the app dir and the symlink dangles.
  #  - the build command, which dereferences that symlink into real files. Vercel's static collector
  #    cannot follow it: the first deploy died with `ENOENT: mkdir '/vercel/output/static/photos'`.
  bunx vercel project update maximal-kracht --root-directory apps/shop-kracht --framework nextjs
  bunx vercel project update maximal-kracht --build-command \
    'rm -rf public/photos && cp -RL ../../assets/photos/kracht public/photos && next build'
  # Origins travel as env vars so the frozen localhost defaults stay in source [TASKS §0 #11].
  bunx vercel env rm NEXT_PUBLIC_SITE_ORIGIN production --project maximal-kracht --yes 2>/dev/null || true
  bunx vercel env rm NEXT_PUBLIC_PLATFORM_ORIGIN production --project maximal-kracht --yes 2>/dev/null || true
  printf '%s' "$KRACHT"   | bunx vercel env add NEXT_PUBLIC_SITE_ORIGIN production --project maximal-kracht
  printf '%s' "$PLATFORM" | bunx vercel env add NEXT_PUBLIC_PLATFORM_ORIGIN production --project maximal-kracht
  bunx vercel deploy --prod --yes --project maximal-kracht
}

verify() {
  echo "— platform: every shop resolves to its OWN config"
  # THE check. `packages/agent/src/config.ts:16` requests an EXTENSIONLESS /v1/config/<shop>, so
  # staging the files as *.json and leaning on a catch-all rewrite silently serves the default to
  # every brand: widget mounts, no 404, no CORS error, every other assertion green, and the only
  # symptom is that the three brands stop looking different. Compare the accents, not the status.
  local seen=()
  for shop in velde kracht helder; do
    accent=$(curl -sf "$PLATFORM/v1/config/$shop" | python3 -c \
      "import sys,json; print(json.load(sys.stdin)['tokens']['css']['--mx-accent'])") \
      || fail "$shop config did not parse"
    echo "    $shop → $accent"
    for prev in ${seen[@]+"${seen[@]}"}; do
      [ "$prev" = "$accent" ] && fail "two brands share accent $accent — the deploy is serving one config to all"
    done
    seen+=("$accent")
  done

  echo "— platform: an unknown shop key falls back to the default, never a 404 [T6 DoD]"
  code=$(curl -s -o /dev/null -w '%{http_code}' "$PLATFORM/v1/config/no-such-shop")
  [ "$code" = "200" ] || fail "unknown shop key returned $code, not 200"

  echo "— platform: CORS + strong ETag + 304, the contract apps/platform/server.ts:44-72 pins"
  curl -sI -H 'Origin: https://velde.example' "$PLATFORM/v1/config/velde" \
    | grep -qi 'access-control-allow-origin: \*' || fail 'no CORS header on config'
  etag=$(curl -sI "$PLATFORM/v1/agent.js" | grep -i '^etag' | tr -d '\r' | cut -d' ' -f2)
  [ -n "$etag" ] || fail 'no ETag on agent.js'
  case "$etag" in W/*) fail "ETag is weak ($etag); revalidation is not byte-exact" ;; esac
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "If-None-Match: $etag" "$PLATFORM/v1/agent.js")
  [ "$code" = "304" ] || fail "If-None-Match returned $code, not 304"

  echo "— storefronts: the embed points at the platform, and no frozen origin leaked"
  for site in "$VELDE" "$KRACHT"; do
    html=$(curl -sf "$site/") || fail "$site did not serve a home page"
    grep -q "$PLATFORM/v1/agent.js" <<<"$html" || fail "$site embed does not point at $PLATFORM"
    grep -q localhost <<<"$html" && fail "$site still serves a localhost origin"
    # Checked on the sitemap, not the home page: VELDE emits a canonical on every page but KRACHT's
    # root layout sets no `alternates`, so its home page carries no self-referential URL at all.
    # The sitemap is the one artifact both build from their own SITE origin.
    map=$(curl -sf "$site/sitemap.xml") || fail "$site served no sitemap"
    grep -q "$site" <<<"$map" || fail "$site sitemap does not use its own origin"
    grep -q localhost <<<"$map" && fail "$site sitemap still points at localhost"
  done

  echo "— KRACHT: photographs survived the symlink"
  # Must be measured on the HTML, not by fetching a photo. `apps/shop-kracht/lib/products.ts:41`
  # does existsSync() at PRERENDER time, so a dangling symlink makes it emit no <img> at all —
  # every packshot silently becomes the no-photo fallback tile and nothing ever 404s.
  photos=$(curl -sf "$KRACHT/" | grep -oE '/photos/[a-z0-9._-]+' | sort -u | wc -l | tr -d ' ')
  echo "    $photos distinct photographs referenced"
  [ "$photos" -gt 0 ] || fail 'KRACHT prerendered zero photographs — the symlink dangled'

  echo "ALL CHECKS PASSED — $PLATFORM · $VELDE · $KRACHT"
}

case "${1:-all}" in
  verify) verify ;;
  *) deploy; verify ;;
esac
