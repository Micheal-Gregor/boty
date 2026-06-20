# Order to Cash — Reference Sheet

*The probability model and economy dials. These are **starting defaults to playtest against**,
not gospel. Keep them all in data files so you can re-tune without touching engine code.*

## The reference unit: the wage-turn (W)

One tradesperson's wage for one turn = **1 W**. Everything is priced in W so the dials stay
legible. The core relationship: **a completed job should buy several wage-turns of cushion.**

| Item | Default (in W) | Logic |
|---|---|---|
| Tradesperson wage / turn | 1 W | the unit |
| Sign-on fee | 1–2 W | felt, not prohibitive |
| Severance | 1–2 W | roughly symmetric with sign-on |
| Building rent / turn | 2–5 W (scales with cap) | overhead floor |
| Equipment rent / turn | 1–2 W per tier | premium over owning |
| Equipment buy | 6–10 W | ~4–6 turns to break even vs renting |
| Equipment disposal | 50% of market | a real loss; buying is a bet on sustained use |
| Small completed job | 4–6 W | covers a few idle wage-turns |
| Big job | 10–20 W | tempts you to staff up |
| Invoice factoring fee | 10% of invoice | the cash escape valve |

Sanity check: a small job ≈ 4–6 idle-tradesperson-turns of cushion; a big job ≈ a hiring
spree's worth. If wages are too cheap there's no famine pressure; too steep and one bad draw
kills you.

## Dial 1 — Fortune deck composition (the feast/famine master dial)

Starting mix for a ~40-card deck:

| Slice | Share | Purpose |
|---|---|---|
| Jobs (weighted toward small) | ~50% | the steady diet |
| Windfalls / bonuses | ~20% | feast spikes |
| Shocks / dead turns | ~20% | famine |
| Targeted / sabotage-enabling | ~10% | interaction |

**Make famine structural, not just luck:** build the deck as a fixed composition and **draw
without reshuffling until exhausted**, then reshuffle. A run of shocks becomes a real
"season" players can roughly card-count, rather than random cruelty. Recommended over pure
independent draws.

## Dial 2 — The W-denominated price list

The table above. This is where you nudge overall difficulty: scale job values up for an
easier, cash-rich game; scale overhead up for a grindier one.

## Dial 3 — Job work vs. deadline vs. equipment speed

Keep numbers small and legible at the table. Example shape:

- A small job: work_amount ≈ 4–6 units, deadline ≈ 3–4 turns.
- Base equipment: ~2 units/turn. Better equipment: ~3 units/turn.
- So one tradesperson with base gear clears a 6-unit job in 3 turns — beatable, but tight if
  you over-commit the queue. **That gap is the skill.**
- Multi-tradesperson jobs: each assigned tradesperson adds their (gear × 1) to the burn.

Deadlines should be beatable with adequate staff/gear and missable when you over-commit.

## Dial 4 — Job-progress deck spread

| Slice | Share | Effect |
|---|---|---|
| Neutral / minor | ~40% | small speed/cost ± — most jobs stay on track |
| Positive | ~25% | speed up, completion bonus |
| Negative | ~25% | slow down, added cost, pay docked |
| Decisive | ~10% | auto-success or auto-failure |

Keep the decisive slice low — at 10% jobs feel dramatic; much higher and they feel arbitrary.

## Dial 5 — Civil resolution (d6 targets + deposits)

Each card modifier shifts the target number by ±1; modifiers stack.

| Situation | Defendant wins on | P(win) |
|---|---|---|
| Job done right & on time (baseline) | 2+ | 83% |
| Opponent holds Slick Lawyer | 4+ | 50% |
| Defendant's job late/botched | 3+ | 67% |
| Late/botched **and** opponent has Slick Lawyer | 5+ | 33% |
| Clean defendant **with** own lawyer vs. Slick Lawyer | 3+ | 67% |

**Deposit/match economy:** both sides put in ~2–4 W; winner takes the pot. Because a clean
defendant wins 83% of the time, **suing an innocent player is a losing bet** — which is the
self-balancing feature: lawsuits become a tool to punish the late and the stretching, not the
diligent. Preserve this relationship when tuning.

## Dial 6 — AP non-payment (NPC Demand Roll + player sue window)

**NPC vendors — escalating Demand Roll, then Court** (the press-your-luck dial):

| Turn dodging | Pass on | P(pass) | Special |
|---|---|---|---|
| 1st | 2+ | 83% | natural 6 → pay 50% to settle |
| 2nd | 3+ | 67% | |
| 3rd | 4+ | 50% | |
| 4th | 5+ | 33% | |
| 5th (last) | — | — | natural 6 → forgiven |

**Fail → court:** post amount owed + damages fee (≈1 W), then a second d6 under the civil
resolver at a **penalized defense target** (weak case — e.g. 3+ or worse). Win → walk clean
(AP wiped, fee reimbursed; the only cost is social — open books, the whole table watching).
Lose → pay full to bank + fee. With a clean win there's no mechanical lever to make "just pay
it" competitive — so tune via the **court defense target** (how bad a dodged debt makes your
case) and how often vendors land in the dodge-able pool. The deterrent is reputational by
design.

**Player vendors — 4-turn sue window.** Creditor may sue any turn within the window
(merit-based, Slick Lawyer ±1). Unsued at window end → debt forgiven. The window length (4)
is itself a dial: longer = more time to draw a Slick Lawyer, favoring creditors.

**Class Action card:** 1 copy in the Civil deck. Rare by design — a lurking threat, not a
routine event. Adding copies raises the risk premium on the float strategy.

## Game length

`max_turns` (config) — fixed number of rounds; highest cash wins. Start around **12–20** and
tune: too short and the float/litigation systems never bite; too long and a leader runs away.

## Draw-power scaling

`cards_per_turn` = number of tradespeople, **capped** (e.g. max 4–5). The cap stops a runaway
leader from drawing 9 cards and lapping the table. Tune the cap to taste.

## Quick tuning guide

| If playtest shows… | Turn this dial |
|---|---|
| Nobody ever feels broke | raise overhead / wages, or lower job values (Dials 1–2) |
| Famine never bites | raise shock share, use fixed-deck no-reshuffle draw (Dial 1) |
| Jobs always succeed / never fail | raise negative & decisive shares (Dial 4) |
| Lawsuits feel random or unfair | re-check target numbers & deposit sizes (Dial 5) |
| Leader runs away early | lower the draw cap; make sabotage slightly cheaper (Dial 1 cap) |
| Sabotage feels oppressive | make it rarer/costlier, ensure enough Rush/Buy-Time counters |
| Everyone always dodges NPC payments | worsen the court defense target so dodging loses more often (Dial 6) |
| Creditors always/never sue | shorten/lengthen the 4-turn player sue window (Dial 6) |
| Float strategy is too safe | add a Class Action copy, or raise its draw odds (Dial 6) |
| Opening always picks 2nd tradesperson | lower equipment cost or boost its speed (Dial 3) |
