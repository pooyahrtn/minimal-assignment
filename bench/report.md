# bench report

All checks.

| check | tier | result | cases | detail |
|---|---|---|---|---|
| transcript | HARD | pass | 2 | 2 opening-message cases against packages/agent/src/brain/fixture.json: kracht opening (protein shake): empty (3 chip(s) rescue); velde opening (jacket): non-empty (1 product(s)) |
| contrast | HARD | pass | 1400 | 200 seeded MerchantTokens (LCG seed 0x5eed1234), 1400 text/bg pairs checked against AA_GUARANTEED_PAIRS's 7 pairs (independently cross-checked against css.ts — no gap found, see hand-off). Worst ratio 4.500:1. Focus ring (WCAG 1.4.11, >=3:1 vs both accent and surface): 155/200 feasible, 45/200 have no colour in gamut clearing 3:1 on both grounds (reported only, not a defect — a full 0-255 grey scan is a complete search since WCAG contrast is a function of luminance alone), 0 cases where the engine did worse than what was achievable. |

2 checks, 0 HARD failures.
