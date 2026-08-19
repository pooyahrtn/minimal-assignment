# COMPETITORS.md — T14

Scanned **2026-08-19**. Build statuses in §6 were true at scan time; T5/T7 work has landed in the working tree since. 13 products, 4 research lanes, one adversarial pass, 14 agents.
Working file; §4 (the ordered demo list) and §3 (the position) are the deliverables.

**This is not a feature comparison.** `TAKE_HOME.md:35` says to start from *who the merchant
is and what actually happens when you embed someone else's software in your site, rather than
from a list of settings.* The first pass at this file was a list of settings and has been
thrown away. Every product below is read as **an answer to one question**:

> Merchants want the agent to match their brand closely — close enough is not good enough.
> Many merchants cannot name their own brand. How do you serve both with one interface?

**Verification.** `doc` = vendor pages opened and quoted. `search` = summaries only.
`unverified` = third-party or inference. 11 of 13 product rows are `doc`.

---

## 1. The tension has three poles, not two

- **Fidelity** — it sits next to the merchant's own buttons for direct comparison. Approximate reads as broken.
- **Ability** — no hex, no font name, sometimes no idea what "accent colour" means.
- **Reality** — the widget lands in a document it does not control, and **the browser refuses some of what fidelity requires regardless of what anyone wants.**

Fidelity-vs-Ability is a slider, and §2 shows eight places the market has put it.
**Fidelity-vs-Reality is not a slider, and it is the binding constraint.** Three platform facts
cap the ceiling before the config page is opened:

- **`@font-face` declared inside a shadow root does not render.** Still broken as of Aug 2024 ([mdn/interactive-examples#887](https://github.com/mdn/interactive-examples/issues/887)); the documented workaround is to register the font *outside* the shadow DOM. So **"fully isolated in a shadow root" and "exact brand font match" cannot both be true.** That is a real architectural fork, not a detail — see §5.
- **Stacking contexts are atomic in their parent** ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context)). A correctly configured widget still loses to the merchant's cookie banner. Shadow DOM buys nothing here.
- **iOS Safari hides `position:fixed; bottom:0` under the virtual keyboard**, and the standards fix (`interactive-widget`) has not shipped in WebKit. The lever does not exist on the browser most shoppers use.

**What survives:** inheritable properties and CSS custom properties *do* cross the shadow
boundary — "custom CSS properties pierce through shadow DOM, they are visible everywhere."
Which is exactly the channel our token system already uses.

---

## 2. The market's answers, ranked by vocabulary size

Vocabulary = merchant-facing **appearance** controls. Counted the same way for every product.

| Product | Controls | Font? | The position it takes |
|---|---|---|---|
| **Gorgias** | 11 | none | Line drawn very low, then a **separate developer-only** CSS/JS injection route that is explicitly disowned. Bimodal: pixel-perfect with a developer, one accent colour without. No bridge between. |
| **Manifest AI** | 13 | none | Smallest true ceiling in the set. Its own docs concede it "will always read as Manifest's chat card, tinted one of your colors, not a native piece of the storefront." |
| **Klevu / Nosto** | 14 | none native | Klevu configures **inside Shopify's theme editor** — the merchant styles it where they style their store. Nosto forks a template and hands you a `nosto-cli` dev workflow. Same category, opposite bets. |
| **Algolia / Wizzy** | 14 named, then unbounded | raw CSS only | Algolia's docs "address only developers" — the non-technical merchant is *not in the audience at all*. Ceiling is your frontend team, unbounded upward, absent without one. |
| **Tidio / Lyro** | 19 | none | Two fixed container shapes, three fixed sizes, colours hand-picked and **not derived from each other**. |
| **Zoovu** | 25 | one, theme-level | No self-serve font-family on Zoe; real control means a Vue.js theme rebuild. |
| **Rep AI** | 27 | **yes — any hosted `.woff2` URL** | The outlier. See below. |
| **Rebuy** | 32 | none native | Ten times the colour granularity of Gorgias and *the same font gap.* More knobs on one axis doesn't buy the axis everyone misses. |
| *(Intercom, pilot)* | ~6 | none | Smallest vocabulary, and fills it automatically from a typed domain. Refuses font and CSS **silently** — neither appears in official docs, only in staff forum replies. |

**Three findings from the shape of that table:**

1. **Typography is the field's blind spot, not a size problem.** Gorgias at 11 controls and Rebuy at 32 have the *identical* fidelity gap. Adding knobs to the colour axis never reaches it.
2. **Rep AI proves the gap is a choice.** It takes any publicly reachable `.woff2` URL — *"in practice the easiest source is the font your store's theme already uses."* One product, small vocabulary, real font parity. Nobody else does it.
3. **Nobody guarantees legibility.** Gorgias, Tidio, Rebuy, Zoovu, Klevu and Nosto ship **zero** contrast guarantee — Gorgias's own docs leave "an illegible or clashing color combination... the merchant's own risk to manage." Rep AI claims WCAG 4.5:1 but never says whether it overrides a merchant's out-of-range hex. **That gap, not vocabulary size, is where we actually differ.**

**Where the merchant previews.** Gorgias, Tidio and Manifest preview against a **mock panel** in
their own dashboard — Manifest's is "an isolated widget card floating on a blank white panel with
no page content behind it." Only Rebuy previews against the real storefront (a `?preview_smart_cart=`
URL param), and Rebuy's docs admit why the alternative is dangerous: the two "render in different
environments and can look genuinely different." **A mock preview cannot show you the one thing that
matters — whether it looks right next to their own buttons.**

---

## 3. Is matching exactly even the goal? — No.

The lane that was allowed to overturn the plan did.

Every respected embedded UI takes the host's colour and type and then **locks its own geometry**:

- **Shop Pay** — *"Changes to this core UX/UI runs the risk of diminishing trust."*
- **Apple Pay** — *"Don't alter the artwork in any way or create your own version."*
- **Disqus** — font size, like-button and label text stay fixed regardless of plan.
- **Intercom** — no font, no CSS, geometry permanently Intercom's.

And the legal floor moved **this month**: **EU AI Act Article 50 has been binding since 2 August
2026** — AI interaction must be "clear and distinguishable... at the latest at the time of the first
interaction," unless obvious to a reasonably well-informed person. **A widget engineered to
disappear into the host page is precisely the case most likely to fail that exemption.**

So the goal is not mimicry. It is a **respectful guest**: derived tokens over a small, constant,
non-derivable signature. That is what the whole field's most trusted embeds already do, and now
what the law asks for.

---

## 4. The adversary's verdict on our own bet

Five attacks. **Three landed.**

| Target | Verdict | What it forces |
|---|---|---|
| Few inputs → derive the rest | partially | Mechanism is validated (Radix, Stripe). But **font is the gap**, and "a font choice" as a curated picker doesn't close it. Claim *"won't look wrong"*, not *"will look like you."* |
| The 4.5:1 clamp | partially | **Not the clamp — its silence.** Zero competitor illegibility complaints surfaced anywhere; brand-*mismatch* complaints did. Show the clamped pair as a named token (Stripe ships exactly this: `accessibleColorOnColorPrimary`). Hard floor on task-critical pairs; relax elsewhere. |
| No custom-CSS box | **lands** | Our shadow root makes "no escape hatch" **structurally harsher than any competitor's** — theirs can be hacked with unscoped page CSS, ours categorically cannot. Stripe refuses raw CSS too, but ships fenced `rules`: named parts, allowlisted properties. We need the same. |
| URL ingest | **lands** | Must never auto-apply. Every real precedent presents candidates for confirmation — Intercom's dropdowns, Context.dev *refusing* to assert which extracted colour is "the" brand colour. Shopify sits behind Cloudflare by default; a blocked crawl must fail loudly, not silently default. |
| The premise itself | **lands** | See §3. |

> **Verdict:** *"Fix those three and the bet holds as designed; ship the current silent-clamp,
> zero-escape-hatch, auto-apply version and it fails on exactly the axes this research already documents."*

---

## 5. What we still do not know

- **Whether merchants complain about brand mismatch at all.** Review mining across all eight products found essentially zero appearance complaints. That may mean they churn silently rather than post — or that the founding premise is overstated. Every pass was a partial sample. **This is the gap a founder is most likely to find.**
- Whether Rep AI's 4.5:1 claim overrides a merchant's own hex, or only describes defaults. Undocumented.
- G2 returned 403 for Zoovu and Manifest; Canva's Brand Kit page 403'd twice; a chatbot-trust study 403'd. Cited directionally only.
- One live contradiction, unadjudicated: a third party claims Tidio auto-pulls branding; Tidio's own install docs do not.
- No product data on whether a visible AI-disclosure badge helps or hurts conversion. Article 50 is a **legal** argument, not an evidenced product one.

---

## 6. The ordered demo list — the deliverable

Six minutes. Minutes go to the differentiators and nowhere else.

| # | Time | Beat | Built? |
|---|---|---|---|
| 1 | 0:00–0:30 | Two stores, one `<script>` tag, side by side | ✅ |
| 2 | 0:30–2:30 | **The obstacle at 375px.** Names the blocking constraint *and the number*, offers the drop | 🔨 brain ✅, `no-match` renderer **in the working tree, uncommitted** |
| 3 | 2:30–4:00 | **Config page: domain first, five fields, confirm-don't-apply.** Say the Gorgias line out loud | 🔨 `apps/platform` has a server + per-shop config, uncommitted |
| 4 | 4:00–5:00 | **Third brand typed live** — the clamp visibly refusing to render it illegibly | ❌ T11 |
| 5 | 5:00–5:40 | Preview **against the real storefront**, not a mock — with Rebuy's own warning as the reason | ⚠️ |
| 6 | 5:40–6:00 | What we refuse, and why. Font-as-file. The signature that is never overridable | ✅ |

**One sentence each, only if asked:** shadow-root isolation, hostile-page adversaries, e2e suite,
JSON-LD, the ingest ladder, avatar/voice, light-dark.

**Three things to say when asked how this differs** — each falsifiable:

1. **"We're the only one that guarantees legibility, and we show the guarantee."** Eight products checked, zero documented contrast clamps.
2. **"We closed the escape hatch on purpose, and we know what that costs."** Their merchants hack an iframe with unscoped page CSS; our shadow root closes that door structurally, which makes "no custom CSS" harsher here than anywhere else in the table. We ship no hatch today — the named next step is Stripe's `rules` (named parts, allowlisted properties), and it is a stated ceiling, not a built feature. *(Rewritten 2026-08-19: the original claimed a hook `T7` had explicitly cut.)*
3. **"We treat a font as a file, not a dropdown."** Five of eight have no font control at all.

---

## Sources

Per-product evidence with opened/quote flags lives in the workflow journal:
`subagents/workflows/wf_3e07a3ca-77d/journal.jsonl` (14 agents, 463 tool calls).
Pilot run: `wf_914d7d2d-978`.

Key primary sources — [MDN: stacking context](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context) ·
[mdn/interactive-examples#887 (@font-face in shadow DOM)](https://github.com/mdn/interactive-examples/issues/887) ·
[Intercom Messenger customization](https://www.intercom.com/help/en/articles/178-customize-the-intercom-messenger) ·
[Intercom staff: "we do not support custom CSS in our bots"](https://community.intercom.com/messenger-8/add-custom-css-in-intercom-chatbot-3857) ·
[Gorgias chat + AI Agent](https://docs.gorgias.com/en-US/install-chat-and-enable-ai-agent-on-gorgias-4462157) ·
[Tidio widget customization](https://help.tidio.com/hc/en-us/articles/5398825058588-Customize-your-chat-widget) ·
[Rebuy Smart Cart CSS guide](https://help.rebuyengine.com/en/articles/9492193-smart-cart-css-customization-guide) ·
[Rep AI Shopify](https://www.hellorep.ai/integrations/shopify) ·
[Manifest AI](https://getmanifest.ai/) ·
[Klevu Shopify integration](https://support.klevu.com/hc/en-us/articles/39396963838363-Integration-Steps-for-Shopify) ·
[Nosto widget templates](https://help.nosto.com/en/articles/5793363-understanding-the-different-onsite-widget-template-types) ·
[Algolia search UI](https://www.algolia.com/developers/search-ui) ·
[Constructor: no search results found](https://constructor.com/blog/no-search-results-found)
