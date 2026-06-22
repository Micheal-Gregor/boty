# Experience E5 — the round-flow & pop-up overhaul

The mechanics are fun (confirmed in a 6-player playtest). E5 makes the game *read* well: every event
is surfaced where and when it matters, the turn plays as a guided sequence, and cards become the
interactive surface for the actions you take on them. This is a UX layer over the existing engine —
plus **one real mechanic change** (per-worker equipment, §7).

---

## 1. Three information surfaces (the organizing principle)

| Surface | Means | Behaviour |
|---|---|---|
| **Card pop-up** | something was *dealt* | read it; easy close; turn's draws are hand-spaced & scrollable; open cards carry **action buttons** |
| **Alert window** | something was *calculated* | acknowledge a result (litigation, project, bankruptcy, the upkeep total) |
| **Inline error** | a blocked action | message **flashes and vanishes in that section** — never the bottom bar |

Everything below sorts into these three.

---

## 2. The pop-up QUEUE (foundation)

A single sequencer drives all modals so they appear **one at a time, in order**, each with an easy
close/next, and an **auto-close** option (from Settings). The turn is a scripted sequence through it:

1. **Round intro** — season/round art + the town's flavor text for this round. (Once per round, at
   the top.)
2. **Turn-start executive summary** (per player, as their turn begins) — a graphic exec summary:
   **total shop capacity** + **recurring expenses** itemised (rent · wages · equipment · service
   premiums · **fines/inspections** · LOC interest · town levy) + the **upkeep money total** for the
   round rolled into one (collections in, bills/levies out → net). This replaces today's scattered
   upkeep log lines.
3. **Fortune draw announce** — "you drew N cards" → the cards arrive in hand for reading.
4. **Card reads** — each drawn card pops (hand-spaced, swipeable). Cards with special rules show a
   **rule pop-up** (§5); cards with a forced action explain the rule then force-close (§5).
5. **Outcome alerts** — any computed results this turn (§6).

Queue requirements: skippable ("close all" on your own quiet turns), pacing for watchable rival
turns, never blocks an in-progress engine action mid-resolve.

---

## 3. Settings page (new)

Reachable any time (gear icon). Persisted locally.

- **Sound** toggle · **Music** toggle.
- **Rival pop-ups** — which of a rival's drawn cards pop for you to read. Default = **interesting
  only** (civic · project · incident · sabotage/threat). Options up to "all" / "none".
- **Auto-close** — pop-ups dismiss themselves after a beat (default off for your own cards, on-able).

---

## 3b. Card animation behaviour (still ↔ animation)

Every visual is a **still by default**; the still **is the animation's first frame** (one asset id,
no separate thumbnail). Cards are **thumbnails when closed**.

- **Default open = still, not animated.** A Settings toggle **"Animate my cards on open"** (default
  **off**) makes *your* cards auto-play when opened.
- **Round-intro pop-up auto-animates by default** (the one exception).
- **Opponents' cards never auto-animate.**
- **Click the image to start/stop** any card that *has* an animation (regardless of the auto setting).
- **Sound on/off control at the card's top-right** while it plays (muted until you turn it on).
- **Still-only assets can't animate** — the click is a no-op.

*Pipeline (built):* `Art` renders a `<video>` (poster = the still) whenever an animation file exists
for that id, else the still image, else the placeholder. `autoplay` / `animatable` props; the caller
decides auto-play from context (round = on · opponent = off · your cards = the setting).

## 4. Interactive card modals (open card = the action surface)

Open cards carry their actions as buttons. Productivity math (§7) is surfaced on the card.

- **Tradesperson card** — **productivity number top-right** (their effective work/turn). Below it the
  stack that produced it: *equipment assigned*, *training bonus*, *(defect drag)*. Buttons:
  **Assign / Unassign equipment**, **Fire**.
- **Equipment card** — **Dispose** button only (owned) / **Cancel** (rented).
- **Job card** — **work units `0/4` top-right**; **total assigned work score** below it (sum of the
  assigned crew's productivity); button: **Assign a worker**.
- **Subcontract job** — opens as a job but is **uninteractable**; a rule pop-up explains "this isn't
  yours to staff — you broker it," you close it, and the card **auto-closes** (it leaves your hand).
- **Open Hand** button — opens everything you currently hold, **grouped by type** (tradespeople /
  equipment / jobs / standing / hand cards / projects).

---

## 5. Rule pop-ups & forced actions

A **rule pop-up** explains a card's special rule. It fires for cards that *have* a special rule:

> **rule pop-up**: subcontract · civic · project · defect · gift · BBB Special · personal
> (standing) · global (town effect)
>
> **no rule pop-up** (self-evident): job · incident · payable · windfall · shock · crew · theft ·
> character · retirement · summons

**Forced actions** (the card makes you do something — discard, hand over, lose a worker): the rule
pop-up explains it **before** it resolves, then the card **force-closes** as the action applies.

---

## 6. Alert windows (computed outcomes)

Acknowledge-style windows, not cards:

- **Litigation**: NPC court result · player sue/collection result · damages-suit result · settlement
  offer & result · sabotage landed/countered. *(These already have modals — restyle as alert
  windows; surface the **result**, not just the decision.)*
- **Project**: delivered (balance + favours) · collapsed (forfeit + town levy).
- **Civic job**: delivered / collapsed.
- **Expansion**: moved in / deposit forfeited.
- **Bankruptcy**: a shop folds + the cleanup.
- **Upkeep money**: folded into the turn-start summary (§2.2), not separate windows.

---

## 7. Equipment model A — per-worker assignment (THE mechanic change)

Today equipment is a **shared speed pool** (`runJobProgress` sorts tool speeds desc and allocates
best-first across all assigned workers). E5 makes it **explicit per worker** so the card UX is real:

- Each equipment instance gains `assigned_to` (a tradesman id) or `null` (idle).
- New actions: `assignEquipment(equipmentId, tradesmanId)` / `unassignEquipment(equipmentId)`. One
  tool per worker; one worker per tool.
- **Productivity (per worker)** = (assigned tool's `speed` if any, else `base_hand_speed`) + training
  share − defect-drag share. Exposed via a helper (`workerProductivity`) for the card's top-right
  number and the modifier stack.
- **Job work score** = Σ productivity of the workers assigned to that job (the job card's number).
- `runJobProgress` burns each job by its assigned workers' productivity (no more global pool).
- **Idle tools still cost rent/overhead but produce nothing** — a real "don't over-buy gear" lesson.
- `equipment_per_tradesman` job gate → satisfied when every assigned worker has a tool assigned.
- **Re-balance:** this changes the burn model → re-run the tuning harness; expect to retune
  equipment speeds/costs and re-check Dial 3 (equipment vs labor).

---

## 8. Win screen — tabbed

- **Winner** — the champion, headline number.
- **Consolation prizes** — side awards (most jobs, biggest single contract, etc. — TBD list).
- **Financials** — scroll through **each player's** statements (P&L + balance sheet). A **bankrupt**
  player's ledger is **greyed** with a big **angled "BANKRUPT" stamp** over it.

---

## 9. Always-available references

- **Rules reference** — a **? (question-mark-in-circle)** icon opens the game rules to read any time.
- **Move-shop confirmation** — relocating/expanding first pops a **rules explainer with Yes/No**
  confirm before committing the deposit.

---

## 10. The catalog (what each event maps to)

**Card pop-ups** — every Fortune draw (job · subcontract · civic · project · incident · windfall ·
shock · defect · crew · theft · character · payable · gift · bbb_special · retirement · summons),
your **personal cards** on gain (insurance · marketing · accountant · training · favor), **global
cards** on apply (levies/booms), and **rivals'** draws per the Settings filter.

**Alert windows** — §6.

**Inline flash errors** (per section): Tradespeople (hire/fire/capacity/afford) · Equipment
(one-per-turn/afford/owned-vs-rented) · Warehouse-expansion (already-in/not-a-step-up/already-
readying/afford) · Jobs (state/max-crew/gate/worker-busy/sticky/routed) · Receivables (no-invoice/
not-delivered) · Payables (can't-cover) · Standing-BBB (fair-not-in-town/already-carry) · Hand
(no-card/no-target/window-closed) · general (bankrupt/relocated/game-over).

---

## 11. Build phases

1. **Foundation** — pop-up queue · Settings page · round-intro → turn-start exec summary ·
   recurring-expense + capacity + upkeep-total aggregation.
2. **Equipment model A** — the engine change (§7) + re-balance, so the interactive cards have real
   numbers to show.
3. **Interactive cards** — card modals with action buttons · Open-Hand grouped view · rule pop-ups ·
   forced-action pop-ups · flash-and-vanish errors.
4. **Outcomes & rivals** — alert windows (litigation/project/bankruptcy) · rival card pop-ups ·
   scroll-rivals'-shops.
5. **Bookends** — win-screen tabs (+ bankrupt stamp) · rules reference · move-shop confirm.

*(Phase 2 lands before 3 so the cards in Phase 3 display true per-worker productivity.)*

---

## 12. Open / TBD
- Consolation-prize list (which side awards).
- Exact exec-summary graphic layout (art).
- Rival-pop-up pacing (auto-advance speed) in big tables.
- Rules-reference content (write the player-facing rules text).
