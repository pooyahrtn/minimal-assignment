#!/bin/bash
# T15 — deploy the three projects, then prove the deployment from outside it.
#
# Every project setting Vercel holds in dashboard state is set here as a command, because a deploy
# that only works if someone remembers which checkbox they ticked is not reproducible from a clean
# clone [ENGINEERING §3.4]. Re-running this is safe and idempotent.
#
#   bash tools/deploy.sh          # build, deploy, verify
#   bash tools/deploy.sh verify   # verify the live deployments only
#
# `bash`, not `bun run`: Bun Shell cannot parse the arrays below and fails at parse time.
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM=https://maximal.releashed.io
VELDE=https://velde.releashed.io
KRACHT=https://kracht.releashed.io

fail() { echo "FAIL: $*" >&2; exit 1; }

deploy() {
  # The two Bun servers become static output: their routes are pure functions of committed JSON
  # plus files, and `apps/platform/server.ts:103` rebuilds the bundle by shelling out to `bun
  # build`, which no serverless host can do. See tools/build-platform.ts for the full reasoning.
  # The storefront origins go IN: each config's catalog carries absolute product `url` and
  # `image` fields built against localhost, and the widget renders them on the deployed page.
  # All three are built by Vercel from the repo, not uploaded as a local dist/: uploading a
  # prebuilt directory still runs the project's own build command against it, and `tools/` is not
  # in there. So the origins live in the build command, the same dashboard-state-as-code rule the
  # KRACHT block below already follows.
  bunx vercel project update maximal-platform --build-command \
    "bun run tools/build-platform.ts --velde=$VELDE --kracht=$KRACHT"
  # Arms `api/platform.ts`. `vercel.json` lives at the repo root and maximal-velde is rooted there
  # too, so that function is built into the storefront's deployment as well; this variable is what
  # makes it answer only on the platform. Set here, so a clean clone does not have to know.
  bunx vercel env rm PLATFORM_API production --project maximal-platform --yes 2>/dev/null || true
  printf '1' | bunx vercel env add PLATFORM_API production --project maximal-platform
  # T13's live intake turn, which this script did not wire and so ran dark in production: `/v1/chat`
  # 503'd every turn and the widget answered from the local brain — correct, and invisible, which is
  # exactly the state a rehearsal "on the deployed links" would not have surfaced. The KEY IS NEVER
  # IN THIS FILE: it comes from the deploying shell, so a clean clone with no key deploys the same
  # deterministic demo it always did, and says so.
  # Both removes live INSIDE the branch on purpose: an unset key means "this shell has nothing to
  # say about the model", not "turn it off". Removing unconditionally would let any routine deploy
  # silently strip a key someone added by hand and put production back to 503 with no output.
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    bunx vercel env rm MAXIMAL_LLM production --project maximal-platform --yes 2>/dev/null || true
    bunx vercel env rm ANTHROPIC_API_KEY production --project maximal-platform --yes 2>/dev/null || true
    printf '1' | bunx vercel env add MAXIMAL_LLM production --project maximal-platform
    printf '%s' "$ANTHROPIC_API_KEY" \
      | bunx vercel env add ANTHROPIC_API_KEY production --project maximal-platform
    echo "— live intake turn: ON in production (key from this shell)"
  else
    echo "— live intake turn: left as-is (no ANTHROPIC_API_KEY in this shell). Whatever the project"
    echo "  already holds stays; with nothing set, /v1/chat 503s and the widget uses the local brain."
  fi
  bunx vercel deploy --prod --yes --project maximal-platform

  bunx vercel project update maximal-velde --build-command \
    "bun run tools/build-velde.ts --site=$VELDE --platform=$PLATFORM"
  bunx vercel deploy --prod --yes --project maximal-velde

  # KRACHT is the only Next.js one, and carries three settings Vercel cannot infer:
  #  - root-directory, so `next build` runs in the app; the deploy still uploads from the REPO ROOT
  #    so that `apps/shop-kracht/public/photos` (a symlink to ../../assets/photos/kracht) has a
  #    target at all. Deploying with --cwd instead uploads only the app dir and the symlink dangles.
  #  - the build command, which dereferences that symlink into real files. Vercel's static collector
  #    cannot follow it: the first deploy died with `ENOENT: mkdir '/vercel/output/static/photos'`.
  bunx vercel project update maximal-kracht --root-directory apps/shop-kracht --framework nextjs
  #  - robots.txt is a static file Next serves verbatim, so the env-var exemption cannot reach it.
  #    VELDE's prerenderer rewrites its copy; this is KRACHT's equivalent. The deployed copy is
  #    noindex: this is a take-home demo, not a shop, and it must not reach a search index. Dropping
  #    the `Sitemap:` line also removes the localhost origin that sed used to rewrite, so that
  #    substitution is gone with it. Source stays frozen and still serves `Allow: /` locally.
  bunx vercel project update maximal-kracht --build-command \
    'rm -rf public/photos && cp -RL ../../assets/photos/kracht public/photos && sed -i -e "s|^Allow: /$|Disallow: /|" -e "/^Sitemap:/d" public/robots.txt && next build'
  # Origins travel as env vars so the frozen localhost defaults stay in source [TASKS §0 #11].
  bunx vercel env rm NEXT_PUBLIC_SITE_ORIGIN production --project maximal-kracht --yes 2>/dev/null || true
  bunx vercel env rm NEXT_PUBLIC_PLATFORM_ORIGIN production --project maximal-kracht --yes 2>/dev/null || true
  printf '%s' "$KRACHT"   | bunx vercel env add NEXT_PUBLIC_SITE_ORIGIN production --project maximal-kracht
  printf '%s' "$PLATFORM" | bunx vercel env add NEXT_PUBLIC_PLATFORM_ORIGIN production --project maximal-kracht
  bunx vercel deploy --prod --yes --project maximal-kracht

  # The three subdomains, attached here rather than in the dashboard for the same reason as every
  # other project setting above. `releashed.io` sits on Vercel nameservers, so each `add` writes the
  # DNS record too — no third-party registrar step. Re-adding an attached domain reports
  # `domain_already_assigned` and exits 0, so this is idempotent. AFTER the deploys, not before:
  # Vercel refuses to assign a domain to a project whose latest production deployment errored.
  bunx vercel domains add maximal.releashed.io maximal-platform
  bunx vercel domains add velde.releashed.io   maximal-velde
  bunx vercel domains add kracht.releashed.io  maximal-kracht
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
    robots=$(curl -sf "$site/robots.txt") || fail "$site served no robots.txt"
    grep -q localhost <<<"$robots" && fail "$site robots.txt still points at localhost"
    grep -q '^Disallow: /$' <<<"$robots" || fail "$site robots.txt does not disallow crawling"
    grep -q '^Sitemap:' <<<"$robots" && fail "$site robots.txt still advertises a sitemap"
  done

  echo "— platform: the config PAYLOAD carries no localhost either"
  # The surface that shipped broken once. The storefront HTML was clean and only that was checked,
  # while each config's catalog held absolute product url/image fields pointing at localhost — so
  # every card on the deployed widget requested its photograph from the shopper's own machine and
  # rendered a blank tile. The page is not the payload.
  for shop in velde kracht helder default; do
    body=$(curl -sf "$PLATFORM/v1/config/$shop") || fail "$shop config did not fetch"
    if grep -q 'localhost' <<<"$body"; then
      fail "$shop config still carries $(grep -o 'http://localhost:[0-9]*' <<<"$body" | sort -u | tr '\n' ' ')"
    fi
  done

  echo "— platform: T7's configuration page is actually deployed"
  # It was built, committed, demoed on localhost and never deployed for as long as the platform had
  # been live, because this script only ever checked /v1/*. A deployed link that 404s at its root is
  # the first thing a reviewer sees.
  page=$(curl -sf "$PLATFORM/") || fail "$PLATFORM/ served no configuration page"
  grep -q '/ui/main.js' <<<"$page" || fail 'the config page does not reference its own bundle'
  grep -q localhost <<<"$page" && fail 'the config page still offers a localhost store to try'
  for asset in /ui/ui.css /ui/main.js; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$PLATFORM$asset")
    [ "$code" = "200" ] || fail "$asset returned $code — the page would render unstyled or dead"
  done

  echo "— platform: the dynamic half — mint, read back, and the install poll"
  # The three routes that cannot be a file on a CDN. Round-tripped, not pinged: a 200 from
  # POST /v1/config proves nothing if the key it mints is not then servable.
  minted=$(curl -sf -X POST -H 'content-type: application/json' \
    -d "$(curl -sf "$PLATFORM/v1/config/default")" "$PLATFORM/v1/config") \
    || fail 'POST /v1/config did not mint a config'
  key=$(python3 -c "import sys,json; print(json.loads(sys.argv[1])['shopKey'])" "$minted")
  grep -q "$PLATFORM/v1/agent.js" <<<"$minted" || fail "the minted snippet does not point at $PLATFORM"
  echo "    minted $key"
  code=$(curl -s -o /dev/null -w '%{http_code}' "$PLATFORM/v1/config/$key")
  [ "$code" = "200" ] || fail "the minted key returned $code — the snippet would serve nothing"
  seen=$(curl -sf "$PLATFORM/v1/published/$key") || fail 'the install poll did not answer'
  grep -q 'firstSeenAt' <<<"$seen" || fail "install poll returned $seen"

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
