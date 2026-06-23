// The cast of Maple Hollow. When a card tied to one of the twelve townsfolk comes up, a short intro
// of that character (their animation from art/townsfolk/<slug>) plays BEFORE the card — so players
// learn who's helping or hurting them. Purely cosmetic; edit the mapping freely. Seeded from the
// "Fires" column of WORLD.md.

export const NPCS = {
  crabtree:  { name: "Mayor Crabtree",   role: "Politics" },
  grit:      { name: "Inspector Grit",   role: "Code enforcement" },
  folsom:    { name: "Dwight Folsom",    role: "Banker" },
  dot:       { name: "Dot",              role: "Diner & gossip" },
  svenson:   { name: "Sven Svenson",     role: "Lumber vendor" },
  hettrick:  { name: "Old Man Hettrick", role: "Tightfisted client" },
  tolliver:  { name: "Marge Tolliver",   role: "Tax assessor" },
  vale:      { name: "Eunice Vale",      role: "BBB chair" },
  ramsey:    { name: "Hal Ramsey",       role: "Chamber of Commerce" },
  developer: { name: "The Developer",    role: "Big projects" },
  boon:      { name: "Chief Boon",       role: "Fire & safety" },
  newcomer:  { name: "The Newcomer",     role: "Wildcard" },
};

// card id → who's behind it + a one-liner shown on their intro.
export const CARD_NPC = {
  // Hettrick — the tightfisted client
  brake_job:           { npc: "hettrick", line: "His pickup's making that noise again — and he'll swear the bill's a swindle." },
  // Chief Boon — fire & safety
  emergency_call:      { npc: "boon",     line: "Chief Boon needs it fixed NOW — the clock is brutal." },
  civic_firehouse:     { npc: "boon",     line: "Boon wants the firehouse up to code." },
  // Dot — diner & word-of-mouth
  diner_trouble:       { npc: "dot",      line: "Something's gone wrong down at the diner." },
  referral_bonus:      { npc: "dot",      line: "Dot's been talking you up around the Hollow." },
  old_client:          { npc: "dot",      line: "A good word brings an old client back." },
  // Inspector Grit — code enforcement
  code_violation:      { npc: "grit",     line: "Inspector Grit red-tagged your work." },
  osha_writeup:        { npc: "grit",     line: "Grit found something else to write up." },
  surprise_inspection: { npc: "grit",     line: "Grit's doing the rounds — surprise inspection." },
  // Marge Tolliver — the assessor
  reassessment:        { npc: "tolliver", line: "Marge Tolliver reassessed your place." },
  depreciation:        { npc: "tolliver", line: "The assessor's books say your gear's worth less." },
  tax_refund:          { npc: "tolliver", line: "The assessor's office cuts you a refund." },
  // Sven Svenson — lumber & materials
  supplier_invoice:    { npc: "svenson",  line: "Svenson's lumber bill came due." },
  supply_credit:       { npc: "svenson",  line: "Sven Svenson floats you materials on credit." },
  vendor_contract:     { npc: "svenson",  line: "A standing supply deal from Svenson's yard." },
  // Hal Ramsey — Chamber of Commerce
  small_business_grant:{ npc: "ramsey",   line: "Hal Ramsey steered a small-business grant your way." },
  networking_lunch:    { npc: "ramsey",   line: "Ramsey works the room at the Chamber lunch — a useful card changes hands." },
  county_fair:         { npc: "ramsey",   line: "The Chamber's county fair is good for business." },
  trade_feature:       { npc: "ramsey",   line: "The Chamber features your trade in the paper." },
  // Eunice Vale — the BBB
  bbb_special:         { npc: "vale",      line: "Eunice Vale opens the BBB vendor fair." },
  // Mayor Crabtree — civic & politics
  civic_townhall:      { npc: "crabtree",  line: "Mayor Crabtree wants the town hall done right." },
  reelection_drive:    { npc: "crabtree",  line: "Crabtree's reelection machine is calling in favors." },
  county_hospital:     { npc: "crabtree",  line: "A civic build — and the Mayor's watching." },
  opera_house:         { npc: "crabtree",  line: "The Mayor's pet project: the opera house." },
  union_drive:         { npc: "crabtree",  line: "Labor organizes — and City Hall won't stand in the way." },
  // The Developer — big projects
  tower_fitout:        { npc: "developer", line: "The Developer's tower — big money, slow pay." },
  warehouse_fit:       { npc: "developer", line: "The Developer needs the warehouse fitted out." },
  // The Newcomer — wildcard
  poached:             { npc: "newcomer",  line: "A newcomer in town is luring your crew away." },
};

/** The intro to play before this card, or null. */
export function npcIntroFor(cardId) {
  const m = CARD_NPC[cardId];
  if (!m) return null;
  const who = NPCS[m.npc];
  return who ? { npc: m.npc, name: who.name, role: who.role, line: m.line } : null;
}
