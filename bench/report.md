# bench report

All checks.

| check | tier | result | cases | failures | detail |
|---|---|---|---|---|---|
| transcript | HARD | pass | 4 | 0 | 2 opening-message cases against packages/agent/src/brain/fixture.json + 2 brand-matched gold case(s): kracht opening (protein shake): empty (3 chip(s) rescue); velde opening (jacket): non-empty (1 product(s)) — matches gold bench/gold/velde.json, bench/gold/kracht.json |
| contrast | HARD | pass | 1400 | 0 | 200 seeded MerchantTokens (LCG seed 0x5eed1234), 1400 text/bg pairs checked against AA_GUARANTEED_PAIRS's 7 pairs (independently cross-checked against css.ts — no gap found, see hand-off). Worst ratio 4.500:1. Focus ring (WCAG 1.4.11, >=3:1 vs both accent and surface): 155/200 feasible, 45/200 have no colour in gamut clearing 3:1 on both grounds (reported only, not a defect — a full 0-255 grey scan is a complete search since WCAG contrast is a function of luminance alone), 0 cases where the engine did worse than what was achievable. |
| brand-divergence | HARD | pass | 20 | 0 | distance 0.1410 >= 0.11 (ground normalised to #FFFFFF); 5/5 structural properties differ (padding, borderRadius, letterSpacing, boxShadow, textTransform); 20 block renders, no overflow at 375px; contact sheet in bench/gallery/ |
| viewport-375 | HARD | pass | 436 | 0 | 436 measurements across 3 brands (velde, kracht, helder) at 375x667, panel open and closed, plus a 400px-tall pass. Named gap: a real software-keyboard inset cannot be produced headless — Playwright's viewport moves `innerHeight` and `visualViewport.height` together, while a keyboard moves only the second. This covers the short-viewport half of BENCHMARKS' "composer above the keyboard inset"; the inset half is proven on a phone, by hand, and is reported rather than claimed. [ENGINEERING §3.9] |
| isolation | HARD | pass | 1398 | 0 | 1398 computed properties compared inside the shadow root. One config forced onto both live storefronts (VELDE's global `*` reset, KRACHT's Tailwind preflight), then each shop read again with a hostile stylesheet on the host document. `/v1/agent.js` is served from this working copy, not from :4003, so the check measures the tree it runs in. Excluded from the cross-host comparison: .launcher|margin, .panel|margin — the deliberate sticky-bar lift, which differs because the two shops pin bars of different heights. |
| budget | HARD | pass | 11 | 0 | gzipped agent.js: 14459B (cap 15975B). config-fetch-to-first-paint: 16.6ms (cap 400ms), widget stamped at 73.6ms. |
| scorecard | SOFT | pass | 40 | 0 | 27/40 axes green across 10 landed tasks. Open first: T14 (1/4), then T2 (2/4), T12 (2/4), H1+H3 (2/4). NOT judged: T5, T6 (landed after this run). Judge is uncalibrated — advisory only. Rationales: bench/scorecard.json. |

7 checks, 0 HARD failures.
