# Order to Cash — Design Doc

*A turn-based business game for 4–6 players, one-laptop hotseat.*

## The pitch

Each player runs a small service business. You take on jobs, hire tradespeople to do
them, and try to get paid before the deadline — because **a late job pays nothing**.
Meanwhile you're stretching your own vendors to float your cash, dodging lawsuits, and
occasionally sabotaging the player who's running away with it. Everyone's books are open
(you're all members of the local BBB), so the pressure is social, not hidden.

**Object of the game:** have the most cash at the end. Running out of cash mid-game is
the failure state. **The game runs a fixed number of turns** (a config value to tune); when
the counter hits N, highest cash wins. A recession-style end-game shock can be added later.

## Why it's tense

Cash and revenue are different things, and the game makes you feel the gap constantly.
You can have a fat queue of jobs and still go broke because nothing's collected yet. You
survive bad stretches by stretching vendors — but that exposes you to civil action. The
fortune deck swings between feast and famine, so a shop staffed for boom times bleeds
wages in a bust.

## The shop (your operating engine)

A stack of capacities you pay to expand. Everything has friction so you don't thrash the
controls every turn.

- **Building** — sets a hard cap on how many tradespeople you can hold. Monthly rent.
  Multiple options (bigger cap = higher rent). **Relocating costs a whole turn** (no jobs
  progress, overhead still due).
- **Tradespeople** — each one runs **one job at a time**; this is your parallelism. Wages
  paid every turn, idle or not. **Sign-on fee** to hire, **severance** to fire — small, but
  enough that hire/fire is a commitment.
- **Equipment** — sets job **speed** (work burned per turn) and can **gate** big jobs that
  require specific gear. **Buy** (big upfront; dispose at 50% of market — a real loss) or
  **rent** (per-turn premium; cancel anytime free). Multiple tiers.
- **Draw power** — number of tradespeople sets how many cards you draw per turn (capped),
  so a bigger shop sees more opportunity *and* more chaos.

**Starting services (your role).** Each player runs one trade, drawn from the building/
mechanical family so "you must hire the X at the table" cards route cleanly: **mechanic,
plumber, electrician, pipefitter, welder, HVAC technician.** With 4–6 players not every trade
is present, so every trade-routed card also has an NPC/bank fallback.

**The opening (everyone starts identical):** starting cash, the smallest shop, one
tradesperson. First real decision — and it teaches the whole game on turn one:

> **Buy equipment** (finish jobs faster) **or hire a second tradesperson** (run two jobs at
> once *and* draw an extra card)?

Speed vs. breadth-plus-draw. The second tradesperson does double duty, so price equipment
attractively to keep the choice live (watch this in playtest).

## Jobs (the heart)

Jobs come from the Fortune deck. A job has: value, work amount, deadline (turns),
min/max tradespeople, optional required equipment, and a droppable flag.

- Jobs sit in a **queue**. You assign tradespeople; equipment speed burns down the work.
- **The deadline clock always ticks** — even while a job waits in queue or sits on hold.
- **Expire in queue → no penalty, you just don't get paid.** Holding job options is safe;
  the skill is triage — deciding which jobs to actually commit a tradesperson to.
- **Start late → no auto-fail, but you're exposed** to bad job-progress luck unless you
  Rush it.
- **Big jobs** can require/allow multiple tradespeople and/or specific equipment;
  concentrating force finishes them faster. This is the payoff for scaling up.

**Job states:** Queued → Active → On-Hold → (Active again | Expired | Complete).
You can put a job On-Hold to free a tradesperson for a Rush elsewhere, then resume it or
let it expire. On-hold still bleeds the clock.

## Getting paid (AR) and stalling vendors (AP)

- Completed jobs become **invoices**. You can **factor** an invoice for immediate cash at a
  **10% fee** — the escape valve when you're short.
- You carry **vendor contracts (payables)** that come due on a schedule, frequently enough
  to be a live worry. Stretching them is free float — but every turn you dodge is a gamble.

**Skipping an NPC vendor — Demand Roll, then Court (press your luck, then litigate).** Each
turn you don't pay an NPC payable, roll a d6 against a target that rises every turn.

| Turn dodging | Pass (dodge again) on | P(pass) | Special |
|---|---|---|---|
| 1st | 2+ | 83% | roll a **6** → settlement offer: pay **50%** to clear it |
| 2nd | 3+ | 67% | |
| 3rd | 4+ | 50% | |
| 4th | 5+ | 33% | |
| 5th (last) | — | — | roll **6** → debt forgiven, pay nothing |

**Fail a Demand Roll → you go to court.** You post the **amount owed plus a damages fee
(≈1 W)** and take a **second d6 court roll** under the standard civil rules — but a dodged
debt is a weak case, so you defend at a penalized target. **Win the court roll → you walk
clean: the AP is wiped and the damages fee is reimbursed.** No mechanical penalty for getting
away with it — the cost is purely social (open books, the whole BBB watching). **Lose → pay
the full amount to the bank**, plus the fee. So even when the dodge finally fails, you get one
more roll — at bad odds, with everyone watching. Every NPC dispute runs through the same civil
resolver as player suits. Disputes go to court; the table litigates constantly.

**Skipping a player vendor — the 4-turn sue window.** When you're late paying another player,
they get **4 turns to sue** you to collect (player-vs-player lawsuit, merit-based dice). This
is where the Slick Lawyer metagame lives: if the creditor has no Slick Lawyer and you do, it's
~50/50, so a rational creditor may **wait**, hoping to draw their own lawyer before the window
closes — while you bet they won't. If the window expires unsued, **the debt is forgiven**
(they missed their chance; your gamble paid off).

**CLASS ACTION LAWSUIT (Civil deck, rare — one copy).** If drawn, **every player must settle
all their AP immediately at full value.** The reckoning for everyone floating on stretched
vendors — rewards those who paid down, punishes the over-leveraged, table-wide, in one stroke.

**Abandoned player-to-player jobs.** A job started but not completed *between players* triggers
the wronged party's option to **sue**. This gives the forced "deposit now, we'll see about the
rest" jobs their enforcement teeth. (Expired NPC jobs: no penalty, as with all queue-expiry.)

## The three decks

- **Fortune** — generates jobs, windfalls, and shocks. Tuned for **feast and famine**.
- **Job-progress** — drawn against active jobs: speed up, slow down, dock pay, add cost,
  or end in success/failure.
- **Civil** — lawsuits, audits, back taxes, "win a beauty pageant, collect $500," and the
  targeting/counter cards (sabotage, rush, slick lawyer, buy-time).

## Cards that touch any job — and the counter system

Some cards target **any player's** job or payable, not just your own:

- **Sabotage** — delay a target's job toward (or past) its deadline. *Rare and counterable*,
  not cheap — otherwise the table just torches the leader.
- **Rush** — recover lost time / speed a job (the counter to sabotage; also salvages a
  late start).
- **Buy Time** — universal: extend any deadline by 1–2 turns. Apply it to your own job, to
  an **AP** due date (hold up a payment), to an **AR** window, or against another player.
  Sabotage shrinks runway; Buy Time restores it.

Players **hold a hand** and play cards reactively. Sabotage→Rush and Sue→Slick-Lawyer both
run through one **response window**: the engine announces the threat, the target may play a
counter or let it land, then it resolves.

## The two dice resolutions (d6 + modifiers)

**Civil action.** Complainant puts down a deposit; defendant must **match it** (lawyer fees)
to contest, or lose by default. Roll a d6 against a target set by merits, modified by cards
(each modifier shifts the target ±1):

| Situation | Defendant wins on | P(win) |
|---|---|---|
| Job done right & on time (baseline) | 2+ | 83% |
| Opponent holds Slick Lawyer | 4+ | 50% |
| Defendant's job late/botched | 3+ | 67% |
| Defendant hires own lawyer | shifts back toward 2+/3+ | — |

Winner takes the pot. Because a clean defendant wins 83% of the time, **suing an innocent
player is a losing bet** — lawsuits naturally become a tool against the late/stretching, not
the diligent.

**Job-progress.** Same spirit — cards carry ±modifiers; completion quality can feed a later
lawsuit roll (a botched job lowers your defense number).

## What the computer does (and doesn't)

The program is the **banker, rules-lawyer, and ledger** — not an opponent. It deals services
and cards, tracks every player's cash/debt/jobs/payables on an open ledger, **enforces forced
transactions and timers** (jobs mature, invoices come due, clocks tick), runs the response
window and dice, and refuses illegal moves. It prompts whose turn it is and what's legal, but
**humans make every decision.** Rules enforced; play feels manual.
