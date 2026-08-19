# bench report

All checks.

| check | tier | result | cases | detail |
|---|---|---|---|---|
| transcript | HARD | pass | 2 | 2 opening-message cases against packages/agent/src/brain/fixture.json: kracht opening (protein shake): empty (3 chip(s) rescue); velde opening (jacket): non-empty (1 product(s)) |
| contrast | HARD | pass | 1400 | 200 seeded MerchantTokens (LCG seed 0x5eed1234), 1400 text/bg pairs checked against AA_GUARANTEED_PAIRS's 7 pairs (independently cross-checked against css.ts — no gap found, see hand-off). Worst ratio 4.500:1. Focus ring (WCAG 1.4.11, >=3:1 vs both accent and surface): 155/200 feasible, 45/200 have no colour in gamut clearing 3:1 on both grounds (reported only, not a defect — a full 0-255 grey scan is a complete search since WCAG contrast is a function of luminance alone), 0 cases where the engine did worse than what was achievable. |
| brand-divergence | HARD | pass | 20 | distance 0.1507 >= 0.11 (ground normalised to #FFFFFF); 5/5 structural properties differ (padding, borderRadius, letterSpacing, boxShadow, textTransform); 20 block renders, no overflow at 375px; contact sheet in bench/gallery/ |
| budget | HARD | pass | 10 | gzipped agent.js: 11845B (cap 15975B). config-fetch-to-first-paint: 43.8ms (cap 400ms), widget stamped at 277.5ms. |
| scorecard | SOFT | pass | 40 | 27/40 axes green across 10 landed tasks. Open first: T14 (1/4), then T2 (2/4), T12 (2/4), H1+H3 (2/4). NOT judged: T5, T6 (landed after this run). Judge is uncalibrated — advisory only. Rationales: bench/scorecard.json. |

5 checks, 0 HARD failures.
