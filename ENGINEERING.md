# ENGINEERING — where logic lives, what "done" means, what is mechanically enforced

> **What this is.** The engineering law for Maximal AI. `PRINCIPLES.md` owns product taste and the
> token contract; this doc owns how code gets written, verified, and reviewed.
>
> **Standing condition: 100% of this code is written by AI agents working in parallel worktrees,
> and one human reviews all of it.** Every rule below is chosen for that condition. A rule that
> only pays off on a 2-year codebase is not here. Where a question isn't settled, the line says
> **OPEN — needs Pooya** rather than guessing.
>
> **§1 NEVER rules are blockers, not suggestions.** A change that violates one does not land.

---

## 1. NEVER — the hard rules

1. **Never edit storefront source after the `<script>` tag lands.** Any visual bug on a storefront
   is a bug in the widget, fixed in the widget. This rule *is* the demo. [PRINCIPLES §4]
   **One exemption, and only this one: origin literals.** Every hardcoded origin in storefront
   source — the embed line's `src=`, VELDE's `ORIGIN`, KRACHT's `metadataBase` and its two `SITE`
   constants — changed once by T15 to point at the deployed hosts, as `process.env.X ?? '<the
   frozen literal>'` so the default IS the frozen value and local dev, e2e and the bench see
   byte-identical output. An origin string is not a visual fix and cannot hide a widget bug, and
   that rationale covers `metadataBase` exactly as well as it covers the embed. The proof narrows,
   it does not lapse — `git log -p apps/shop-*` must show no changed byte outside an origin
   literal, its `process.env` wrapper, or a comment explaining one.
   **Widened by Pooya mid-T15, not by a desk** — the narrow wording was authored with only the
   embed line in view, and read literally the deployed storefronts would have served
   `<link rel="canonical" href="http://localhost:4002/…">` and a `sitemap.xml` full of laptop URLs.
   [DECISIONS-LOG → Scope, TASKS §0 #11, COMPLAINS #1]
2. **Never invent a token.** No component authors a colour, radius, spacing value, or font size.
   A missing token is a conversation, not a local `#hex`. [PRINCIPLES §2]
3. **Never import from `apps/` inside `packages/agent`.** It is shipped software that happens to
   share a repo. Mechanically enforced — see §4.3. [PRINCIPLES §3]
4. **Never cast with `as`.** Fix the real type: narrow it, add a runtime guard, or fix the
   definition. `as any` in AI-written code is where a whole class of bug hides from the one gate
   that would have caught it.
5. **Never report a task done off an exit code.** "Done" is defined in §3 and requires external
   evidence. An agent claiming success is not evidence.
6. **Never let a configuration render an illegible or broken widget.** The clamp is not advice to
   the merchant; it is a guarantee to the shopper. [PRINCIPLES §7]

---

## 2. ARCHITECTURE LAW — where logic lives

1. **The embed script is a shipped binary you cannot recall.** A merchant pastes the tag once and
   never touches it again; it sits in their HTML and in browser caches indefinitely. So the widget
   is a **thin renderer of a view descriptor**, and every decision that could change — derived
   tokens, voice strings, clamps, catalog, launcher placement rules — is computed on **our** side
   and arrives in the config payload. Before writing an `if` in the widget, ask "could this be in
   the config?" If yes, it goes in the config. This is the highest-value rule in the doc: it is why
   a `/v1/config` change reaches every merchant instantly and a widget change does not.
2. **Design `/v1/config` to absorb tomorrow's change.** Return server-chosen *values*, not booleans
   the widget interprets. **ADD fields, never repurpose or remove one.** Bar before merging any
   change to the payload: "if we change this next week, does an already-embedded script still
   render it right?"
3. **Derive, don't persist.** Every derived token in PRINCIPLES §7 is a pure function of the
   merchant-set ones — none is stored, so changing the derivation is a code edit, not a migration.
4. **One transformation, one place.** Concretely: the phrase→predicate parser used by the shopper's
   opening message (T4) and by the config page's natural-language refinement field (T7) is **one
   module**, not two. Two agents writing it twice in parallel is the exact failure this rule stops.
   [PRINCIPLES §8/§9]
5. **Normalize at the boundary.** Ingest accepts messy JSON-LD and cleans it; nothing downstream
   handles a half-normalised product. Two catalogs with different spec schemas become one
   `{label,value}[]` at ingest and never diverge again. [PRINCIPLES §6]
6. **Exhaustive branching on unions.** Every `switch` over the 7-block message union ends with
   `default: { const _exhaustive: never = block; ... }` — "every block type has a renderer" as a
   compiler guarantee instead of a QA item.
7. **Prefer non-optional types.** An optional field is a branch every caller has to handle; most
   of them won't.
8. **No barrel files, no logic in `index.ts`.** Re-exports only; implementation lives in a named
   file. Barrels are how an agent accidentally couples two packages.
9. **Fail loudly, never half-paint.** PRINCIPLES §5 already requires painting nothing until tokens
   resolve. Same rule as engineering: a missing artifact fails visibly, never silently.
10. **A clamp limits what the merchant can ASK for, never what the shopper is SHOWN.** Caps apply to
    inputs — accent choice, scale, density — and must never truncate a *record* of what the shopper
    did. The constraint-chip row is both the brief and the receipt; a dropped chip stays visible
    rather than being evicted. [PRINCIPLES §8]
11. **Fewest concepts wins.** Count the nouns a reviewer has to hold in their head to follow a
    change — a new type, a new file, a new state, a new config key, a new lifecycle, a new word for
    an existing thing are each one concept. Prefer the version with fewer, even when it costs a few
    more lines. Two names for one idea (`shopKey` and `shopId`, `brief` and `chip state`) is a
    concept added for free and it is the most common way AI-written code becomes unreviewable.
    Concretely: reuse the type that exists rather than defining its near-twin; put the branch in the
    function every caller already routes through rather than adding a layer; extend a value's range
    before adding a flag beside it. This is the rule the cognitive-complexity cap (§4.4) is a
    mechanical proxy for — the cap measures one function, this measures the diff.

---

## 3. VERIFICATION LAW — what "done" means

**The premise: an agent's self-report is the least reliable signal in this project.** Everything
here exists to make "done" mechanically checkable by someone who did not write the code.

1. **A green run that checked nothing must never read as a pass.** Every self-check prints a count
   and asserts it is non-zero. A check that silently collected zero cases is a *failure* — the
   cheapest guard against an agent reporting success on work it did not do.
2. **"Green" means the repo's gates, run the gate-exact way** — `tsc --noEmit` + `biome check .`
   + the task's own self-check, from the repo root. Not "it compiled in my head", not a subset.
3. **An invariant that co-exists with a limit must be tested ABOVE that limit.** Test the chip
   intersection with *more* chips than the number that produces the empty set, and the "closest
   option" scan with more than one candidate. A cap-of-one tested with exactly one item is tested
   at the single size at which the cap cannot bind.
4. **Reproduce, then fix.** A bug fix starts with the smallest check that fails on current main and
   passes after. Without it, an agent has fixed a symptom it guessed at.
5. **Instrument before inferring.** For anything involving time, layout measurement, or ordering
   (launcher position after announcement-bar reflow, keyboard lift at 375px, config-fetch race):
   log the load-bearing numbers and read them first. A screenshot shows the symptom, never the cause.
6. **Look at the screen before you change it.** Any task that proposes, critiques, or changes UI
   opens the actual rendered screen first — a real screenshot at 375px, not the `.tsx`. This project
   is graded on how screens feel.
7. **Cross-brand is verified in greyscale, not in colour.** A change is not done until the same
   surface has been seen under both brands at 375px, desaturated. Colour hides the fact that nothing
   else changed. [PRINCIPLES §7]
8. **Non-trivial logic leaves a runnable check behind.** Prefer high-level behavioural checks that
   survive a refactor over per-function suites. Pure logic (tokens, FSM, retrieval, ingest) is
   `bun test`; anything with a DOM is Playwright — see `BENCHMARKS.md`.
9. **Verify via an external source, never the exit code.** Deployed? Fetch the URL and read the
   response. Config live? `curl` it cross-origin. Widget mounted? Load the storefront and look.
10. **Never pipe a long-running command through `tail`.** It buffers until the pipe closes, so a
    hung build shows nothing. Redirect to a log file and read that.
11. **A benchmark an agent can pass by editing the benchmark is worthless.** Gold files
    (`bench/gold/*.json`) and thresholds are owned by the human. An agent that needs one changed
    says so in its hand-off and stops; it does not change it and report green.
12. **An uncalibrated judge never blocks.** Every LLM-scored axis is SOFT tier — advisory, printed,
    never a gate. Calibrating one needs a human gold set this project has no time to build, so the
    honest move is to say so rather than to trust it.
13. **Assert against the artifact that ships, and derive expected values from the source of
    truth.** A check that measures a value before it is serialized, rounded or rebuilt is testing
    a state the pipeline never ships — measure the hex byte, not the float; the built bundle, not
    the source. And an expected value that legitimately moves with the data is read from that data
    at assert time, never pinned as a literal, or the test fails for being right.

---

## 4. ENFORCED MECHANICALLY — the gates

Guardrails go in **before the first line of feature code**, not after. Retrofitting a complexity
cap onto parallel worktrees is a rewrite. Each item survives a YAGNI test; the ones that didn't are
named in §4.8.

1. **One tool: Biome** (`bunx biome check .`) — format + lint in one pass, no ESLint/Prettier pair
   to keep in sync.
2. **TypeScript `strict: true`, `noFallthroughCasesInSwitch: true`, `noEmit`,
   `verbatimModuleSyntax`.** Plus `suspicious/noExplicitAny: "error"` in Biome, which is what
   actually enforces §1.4 — `strict` alone does not stop `as any`.
3. **Import boundaries are a lint rule, not a hope.** Biome `style/noRestrictedImports` blocks
   `apps/*` from `packages/agent`, **with the reason in the error message** — an agent that reads a
   bare "restricted import" invents a workaround; one that reads *why* respects it.
4. **`complexity/noExcessiveCognitiveComplexity`, cap 15.** A repo with zero lines starts tight.
   This is the rule that keeps AI-written code reviewable — sprawl and premature abstraction are how
   a diff becomes unreadable, not type errors.
5. **`correctness/noUnusedImports` + `noUnusedVariables` at error, not warn.** No legacy to
   grandfather, and dead code an agent left behind is the most common thing a reviewer wastes
   attention on.
6. **Pre-commit runs `tsc --noEmit` + `biome check` on staged paths.** The fast local guard; it
   fires before a human ever sees the diff.
7. **Two test runners, each doing what only it can do:** `bun test` for pure logic — zero config,
   built into the runtime — and **Playwright** for anything with a DOM, because shadow-DOM
   isolation, 375px overflow, and the cross-brand greyscale check are not assertable without a real
   browser. Playwright also produces the screenshots §3.6 requires, so it pays for itself twice.
8. **The benchmark suite is a gate, not a report** — `BENCHMARKS.md` defines it. Its HARD tier
   blocks; its SOFT tier scores the coding agents and never blocks.
9. **Deliberately NOT added, and why:** no coverage gate (on a 36h demo it measures typing, not
   correctness — the benchmark suite measures what is actually graded); no CI (one developer, no
   team to gate; the pre-commit hook and `bun bench` are the gates); no `noUnusedParameters` /
   `noPropertyAccessFromIndexSignature` (noise-to-signal is wrong at this size); no import-sorting
   assist (Biome format is enough). **Revisit only if a specific failure demands it.**

**OPEN — needs Pooya:** max file length and max function length. Biome cannot enforce either
natively; a ~15-line `check-size.ts` in pre-commit would. Worth 15 minutes on day one, or not?

---

## 5. WORKING WITH AGENTS — the review surface

1. **One task, one desk, one worktree.** A desk holds one task at a time. Two agents in one
   worktree collide, which is the exact thing worktrees prevent.
2. **Leave work UNCOMMITTED by default — the dirty working tree is the review surface.** Commit
   only as readable, coherent units, right before landing or when asked. Stage the paths you
   changed; **never `git add -A`**, it sweeps another session's WIP onto your branch.
3. **Land small and often.** It is what shrinks conflicts; a desk carrying two features is how they
   get bundled into one unreviewable land.
4. **Trivial + mechanically-verified → land it yourself.** Single-purpose, green on its gates, not
   a product judgment call, not destructive. When unsure whether it clears that bar, it isn't
   trivial — leave it for review.
5. **Every task hands over a "what I invented" list.** Any decision the task description did not
   specify and the agent chose anyway, in plain sentences, next to the diff. It points the reviewer
   at exactly the places where a parallel agent may have chosen differently.
6. **Every override of a suggestion gets one line in `DECISIONS-LOG.md`, in the same session.**
   What was proposed, what was done, why. A reconstructed answer sounds reconstructed.
   [PRINCIPLES §12]
7. **Talk in plain English.** "The row of things you've told it you want", not "the chip state
   array". Applies to every report, summary, and commit message — not to code comments, which stay
   as detailed as they need to be.
8. **Push back.** If a proposed solution doesn't make sense, say so. Optimize for the best outcome,
   not for agreement.
