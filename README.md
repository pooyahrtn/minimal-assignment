# Maximal — a brand-adaptive shopping agent

A single `<script>` tag that drops a shopping-assistant widget onto any storefront and renders it
in *that merchant's* brand: colours, radius, type scale and voice derived from five inputs, with
an AA contrast clamp that refuses to render text illegibly. Built for the Minimal take-home
(`TAKE_HOME.md`).

Three deployed origins, genuinely cross-origin:

| | |
|---|---|
| Configuration page + platform API | https://maximal.releashed.io |
| VELDE — Amsterdam minimal apparel | https://velde.releashed.io |
| KRACHT — Dutch sports nutrition | https://kracht.releashed.io |

The demo beat is the **obstacle**: ask KRACHT for a shake that satisfies four constraints that
intersect to nothing, and the agent names the blocking constraint *and the number*, offers to drop
one chip, and restores it in a tap. Best seen at 375px.

## Run it locally

Requires [Bun](https://bun.sh) 1.x. Three servers, three terminals:

```sh
bun install
bun run dev:platform   # :4003  — config page, /v1/agent.js, /v1/config/:shop
bun run dev:velde      # :4001
bun run dev:kracht     # :4002
```

Port 4003 is frozen — both storefronts carry it as a literal in their one embed line.

## Checks

```sh
bun run lint           # biome
bun run typecheck
bun run test           # unit — bun test over *.test.ts
bun run bench          # the HARD gates: contrast, transcript, divergence, 375px, isolation, budget
bunx playwright install chromium   # once, ~150MB — the repo has never bundled it
bun run test:e2e       # boots all three servers itself
```

`bun bench <name>` runs one check. Gold files regenerate only under a bare `bun bench --accept`,
which is a human action, never automatic (`BENCHMARKS.md` §4.3).

## The live model is opt-in

Intake (free text → constraint chips) can run through a real LLM; everything downstream —
retrieval, the obstacle, the chip row — stays a deterministic FSM. It is **off** unless you export
both:

```sh
export MAXIMAL_LLM=1 ANTHROPIC_API_KEY=sk-...
```

Every failure returns a bodiless 503 and the widget answers from the local brain, so the demo
works with no key and no network.

## Where things are

```
apps/shop-velde     VELDE — hand-built, prerendered; source frozen after T2
apps/shop-kracht    KRACHT — Next.js; source frozen after T2
apps/platform       config page + API, one Bun router (deployed as one Vercel function)
packages/agent      the widget: token derivation, FSM brain, shadow-root shell, block renderers
bench/              the HARD gate suite and the SOFT scorecard
e2e/                Playwright, *.spec.ts only — *.test.ts is bun test's
tools/              ingest, per-app builds, deploy.sh
```

## The docs, and which one wins

`TAKE_HOME.md` (the brief) beats everything, including this file.

| File | Owns |
|---|---|
| `DECISIONS.md` | **The deliverable.** One page: the six questions the brief asks. |
| `DECISIONS-LOG.md` | Append-only, written as decisions are made. `DECISIONS.md` distils it. |
| `PRINCIPLES.md` | Product taste, the token contract, the agent's behaviour. |
| `ENGINEERING.md` | Where logic lives, what "done" means, what is mechanically enforced. |
| `TASKS.md` | The plan: task graph, per-task scope, DoD and status. |
| `PROGRESS.md` | What actually happened — estimate vs actual, and the standing lessons. |
| `BENCHMARKS.md` | The gates. |
| `COMPETITORS.md` | The scan of 12 products, and the ordered demo list. |
| `COMPLAINS.md` | What went wrong, per task, in the words of whoever hit it. |
| `AGENTS.md` | The process. 100% of this code is agent-written. |

Two constraints that explain most of the shape of this repo: **the storefronts are frozen** after
their one `<script>` line (a shop edited to feed the widget proves nothing), and **no custom CSS**
crosses the shadow root (`PRINCIPLES.md` §5).
