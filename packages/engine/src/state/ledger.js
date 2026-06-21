// The General Ledger — the accounting spine (WORLD.md). Every cash (and the key accrual) movement
// posts a BALANCED journal entry; cash is just account 1000, so it always reconciles to the books,
// and the P&L is a report off the ledger. Win = cash; the P&L shows profit; the gap is the lesson.
//
// Convention: a line's `amt` is a DEBIT when positive, a CREDIT when negative. Assets & expenses
// carry debit balances; liabilities, equity & revenue carry credit balances.

export const ACCT = {
  CASH: 1000, AR: 1100, PREPAID: 1200, EQUIPMENT: 1500, ACCUM_DEP_EQUIP: 1550,
  BUILDING: 1600, ACCUM_DEP_BLDG: 1650,
  AP: 2000, LOC: 2100, TAXES_PAYABLE: 2300,
  CAPITAL: 3000, RETAINED: 3100, DRAWS: 3900,
  REVENUE: 4000, OTHER_INCOME: 4100,
  COGS_LABOUR: 5000, COGS_EQUIP: 5100, COGS_SUB: 5200,
  RENT: 6000, WAGES_IDLE: 6100, INSURANCE: 6200, UTILITIES: 6300, LICENSES: 6400,
  TRAINING: 6500, MEALS: 6600, MARKETING: 6700, PROF_FEES: 6800, LEGAL: 6900,
  DEPRECIATION: 7000, BAD_DEBT: 7100, REPAIRS: 7200,
};

export const ACCT_NAME = {
  1000: "Cash", 1100: "Accounts receivable", 1200: "Prepaid", 1500: "Equipment",
  1550: "Accum. deprec. — equip", 1600: "Shop & buildings", 1650: "Accum. deprec. — bldg",
  2000: "Accounts payable", 2100: "Line of credit", 2300: "Taxes payable",
  3000: "Owner's capital", 3100: "Retained earnings", 3900: "Owner's draws",
  4000: "Contract revenue", 4100: "Other income",
  5000: "COGS — labour", 5100: "COGS — equipment", 5200: "COGS — subcontract",
  6000: "Rent", 6100: "Wages — idle", 6200: "Insurance", 6300: "Utilities", 6400: "Licenses & taxes",
  6500: "Training", 6600: "Meals & entertainment", 6700: "Advertising", 6800: "Professional fees",
  6900: "Legal & settlements", 7000: "Depreciation", 7100: "Bad debt", 7200: "Repairs & maintenance",
};

/** Post a balanced journal entry to a player's ledger; cash (account 1000) flows to player.cash. */
export function post(state, player, memo, lines) {
  const net = lines.reduce((s, l) => s + l.amt, 0);
  if (Math.abs(net) > 0.001) throw new Error(`Unbalanced journal entry "${memo}": off by ${net}`);
  player.ledger.push({ turn: state?.turn ?? 0, memo, lines: lines.map((l) => ({ ...l })) });
  for (const l of lines) if (l.acct === ACCT.CASH) player.cash += l.amt;
}

/** Cash IN, credited to a P&L/BS account (Dr cash / Cr account). */
export function cashIn(state, player, account, amt, memo) {
  post(state, player, memo, [{ acct: ACCT.CASH, amt }, { acct: account, amt: -amt }]);
}

/** Cash OUT, debited to a P&L/BS account (Dr account / Cr cash). */
export function cashOut(state, player, account, amt, memo) {
  post(state, player, memo, [{ acct: account, amt }, { acct: ACCT.CASH, amt: -amt }]);
}

/** A non-cash accrual (Dr / Cr two accounts) — e.g. booking revenue to AR at job completion. */
export function accrue(state, player, drAcct, crAcct, amt, memo) {
  post(state, player, memo, [{ acct: drAcct, amt }, { acct: crAcct, amt: -amt }]);
}

/** Net balance of every account (debit positive). */
export function balances(player) {
  const b = {};
  for (const je of player.ledger || []) for (const l of je.lines) b[l.acct] = (b[l.acct] || 0) + l.amt;
  return b;
}

const sumRange = (b, lo, hi, sign) =>
  Object.entries(b).reduce((s, [a, v]) => (+a >= lo && +a <= hi ? s + sign * v : s), 0);

/** The profit & loss for the year so far, summed from the ledger. */
export function profitAndLoss(player) {
  const b = balances(player);
  const lines = (lo, hi, sign) =>
    Object.entries(b)
      .filter(([a, v]) => +a >= lo && +a <= hi && Math.abs(v) > 0.001)
      .map(([a, v]) => ({ acct: +a, name: ACCT_NAME[a] ?? a, amount: sign * v }))
      .sort((x, y) => x.acct - y.acct);
  const revenue = sumRange(b, 4000, 4999, -1);
  const cogs = sumRange(b, 5000, 5999, 1);
  const overhead = sumRange(b, 6000, 9999, 1);
  return {
    revenueLines: lines(4000, 4999, -1),
    cogsLines: lines(5000, 5999, 1),
    overheadLines: lines(6000, 9999, 1),
    revenue, cogs, grossMargin: revenue - cogs, overhead, netIncome: revenue - cogs - overhead,
  };
}
