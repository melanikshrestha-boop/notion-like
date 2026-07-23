/**
 * Wonder Money — real decision engine (not decorative “insights”).
 * Ranks what to do next from balances, spend velocity, plan, credit, goals.
 */

import {
  cashOnHand,
  creditOwed,
  monthExpense,
  monthIncome,
  monthKey,
  money,
  recentMonthKeys,
  spentByCategory,
  topMerchants,
  type FinanceAccount,
  type FinanceGoal,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";
import type { CreditReport } from "./financeCredit";

export type SmartAction = {
  id: string;
  priority: number; // higher = do first
  severity: "critical" | "high" | "medium" | "low" | "good";
  title: string;
  detail: string;
  amount?: number;
  /** Where to go / what to press */
  cta: string;
  tab?: "overview" | "transactions" | "plan" | "goals" | "insights" | "accounts";
};

export type MonthProjection = {
  dayOfMonth: number;
  daysInMonth: number;
  spentSoFar: number;
  incomeSoFar: number;
  /** Linear projection of month-end spend */
  projectedSpend: number;
  projectedIncome: number;
  projectedFlow: number;
  /** Burn rate $ / day */
  burnPerDay: number;
};

export type SmartBrief = {
  headline: string;
  sub: string;
  actions: SmartAction[];
  projection: MonthProjection;
  safeToSpend: number;
  runwayMonths: number;
  topLeak: { merchant: string; total: number; count: number } | null;
  planHealth: "empty" | "ok" | "tight" | "blown";
  dataQuality: {
    hasTxs: boolean;
    hasIncome: boolean;
    hasAccounts: boolean;
    hasLimits: boolean;
    hasPlan: boolean;
    score: number; // 0–100 how much the model can trust
  };
};

function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function projectMonth(txs: FinanceTx[], ym: string): MonthProjection {
  const dim = daysInMonth(ym);
  const today = new Date();
  const thisYm = monthKey(today);
  const dayOfMonth =
    ym === thisYm ? Math.max(1, today.getDate()) : dim;
  const spentSoFar = monthExpense(txs, ym);
  const incomeSoFar = monthIncome(txs, ym);
  const burnPerDay = spentSoFar / dayOfMonth;
  const incomePerDay = incomeSoFar / dayOfMonth;
  const projectedSpend = burnPerDay * dim;
  const projectedIncome = incomePerDay * dim;
  return {
    dayOfMonth,
    daysInMonth: dim,
    spentSoFar,
    incomeSoFar,
    projectedSpend,
    projectedIncome,
    projectedFlow: projectedIncome - projectedSpend,
    burnPerDay,
  };
}

/** Smarter safe-to-spend: cash − credit min buffer − remaining essentials plan */
export function computeSafeToSpend(
  cash: number,
  debt: number,
  planRows: { id: string; planned: number; spent: number }[],
  projection: MonthProjection
): number {
  const essentials = planRows.find((r) => r.id === "essentials");
  const essentialsLeft = essentials
    ? Math.max(0, essentials.planned - essentials.spent)
    : 0;
  // Keep a floor for debt service: ~3% of card balances or $50
  const debtFloor = debt > 0 ? Math.max(50, debt * 0.03) : 0;
  // Days left this month
  const daysLeft = Math.max(0, projection.daysInMonth - projection.dayOfMonth);
  const projectedBurnLeft = projection.burnPerDay * daysLeft;
  // Conservative: cash − essentials still owed − debt floor − half of projected burn left
  const raw =
    cash - essentialsLeft - debtFloor - projectedBurnLeft * 0.35;
  return Math.max(0, Math.round(raw));
}

export function buildSmartBrief(
  state: FinanceState,
  ym: string,
  planRows: { id: string; label: string; planned: number; spent: number; remaining: number }[],
  credit: CreditReport
): SmartBrief {
  const txs = state.txs;
  const accounts = state.accounts;
  const goals = state.goals || [];
  const cash = cashOnHand(accounts);
  const debt = creditOwed(accounts);
  const income = monthIncome(txs, ym);
  const expense = monthExpense(txs, ym);
  const cashFlow = income - expense;
  const projection = projectMonth(txs, ym);
  const planPlanned = planRows.reduce((s, r) => s + r.planned, 0);
  const planSpent = planRows.reduce((s, r) => s + r.spent, 0);
  const safeToSpend = computeSafeToSpend(cash, debt, planRows, projection);
  const runwayMonths =
    projection.burnPerDay > 0
      ? cash / (projection.burnPerDay * 30)
      : cash > 0
        ? 99
        : 0;

  const merchants = topMerchants(txs, ym, 5);
  const topLeak = merchants[0] || null;

  const hasTxs = txs.length > 0;
  const hasIncome = income > 0 || txs.some((t) => t.kind === "income");
  const hasAccounts = accounts.some((a) => a.balance !== 0);
  const hasLimits = accounts.some(
    (a) => a.kind === "credit" && (a.creditLimit || 0) > 0
  );
  const hasPlan = planPlanned > 0;
  let quality = 0;
  if (hasTxs) quality += 35;
  if (hasIncome) quality += 15;
  if (hasAccounts) quality += 20;
  if (hasLimits) quality += 15;
  if (hasPlan) quality += 15;

  let planHealth: SmartBrief["planHealth"] = "empty";
  if (hasPlan) {
    const over = planRows.some((r) => r.planned > 0 && r.spent > r.planned * 1.05);
    const tight = planRows.some(
      (r) => r.planned > 0 && r.spent / r.planned > 0.85 && r.spent <= r.planned
    );
    planHealth = over ? "blown" : tight ? "tight" : "ok";
  }

  const actions: SmartAction[] = [];

  // ── Data foundation (can't be smart on empty) ──
  if (!hasTxs && !hasAccounts) {
    actions.push({
      id: "import",
      priority: 100,
      severity: "critical",
      title: "Connect money data",
      detail:
        "Import a Chase/bank CSV or load demo. Without transactions, every number is a guess.",
      cta: "Import CSV or Load demo",
      tab: "accounts",
    });
  } else if (!hasTxs) {
    actions.push({
      id: "import-tx",
      priority: 95,
      severity: "high",
      title: "No transactions yet",
      detail: "Balances alone can't project cash flow. Import CSV from your bank.",
      cta: "Import CSV",
      tab: "accounts",
    });
  }

  if (hasTxs && !hasPlan) {
    actions.push({
      id: "auto-plan",
      priority: 90,
      severity: "high",
      title: "Build a plan from real spend",
      detail:
        "One tap averages the last months by category. No typing. Then safe-to-spend gets real.",
      cta: "Auto-build plan",
      tab: "plan",
    });
  }

  // ── Cash flow intelligence ──
  if (hasTxs && projection.projectedFlow < 0) {
    const hole = Math.abs(projection.projectedFlow);
    actions.push({
      id: "burn",
      priority: 88,
      severity: hole > income * 0.2 ? "critical" : "high",
      title: "On track to overspend this month",
      detail: `At today’s pace you’ll end ~${money(hole)} negative. Burn ${money(projection.burnPerDay)}/day.`,
      amount: hole,
      cta: "Cut top merchant or tighten plan",
      tab: "transactions",
    });
  }

  if (cashFlow < 0 && hasTxs) {
    actions.push({
      id: "neg-flow",
      priority: 85,
      severity: "high",
      title: "Cash flow is negative so far",
      detail: `Out ${money(expense)} · In ${money(income)}. Gap ${money(Math.abs(cashFlow))}.`,
      amount: Math.abs(cashFlow),
      cta: "See transactions",
      tab: "transactions",
    });
  }

  // ── Credit ──
  if (debt > 0 && !hasLimits) {
    actions.push({
      id: "limits",
      priority: 80,
      severity: "high",
      title: "Add credit card limits",
      detail:
        "Utilization is ~30% of score math. Without limits the model is half-blind.",
      amount: debt,
      cta: "Accounts → set Limit",
      tab: "accounts",
    });
  } else if (credit.utilization != null && credit.utilization > 0.3) {
    actions.push({
      id: "util",
      priority: 92,
      severity: credit.utilization > 0.5 ? "critical" : "high",
      title: `Utilization ${Math.round(credit.utilization * 100)}% — too high`,
      detail:
        "Fastest score lever: pay before statement close until under 30% (ideally under 10%).",
      amount: debt,
      cta: "Credit tips",
      tab: "insights",
    });
  }

  // ── Plan breaches ──
  for (const r of planRows) {
    if (r.planned > 0 && r.spent > r.planned) {
      actions.push({
        id: `over-${r.id}`,
        priority: 70 + Math.min(15, (r.spent / r.planned) * 5),
        severity: r.spent > r.planned * 1.25 ? "high" : "medium",
        title: `${r.label} over plan`,
        detail: `${money(r.spent)} spent vs ${money(r.planned)} planned (${Math.round((r.spent / r.planned) * 100)}%).`,
        amount: r.spent - r.planned,
        cta: "Review plan",
        tab: "plan",
      });
    }
  }

  // ── Merchant concentration ──
  if (topLeak && expense > 0 && topLeak.total / expense > 0.25) {
    actions.push({
      id: "leak",
      priority: 65,
      severity: "medium",
      title: `Heavy concentration: ${topLeak.merchant}`,
      detail: `${money(topLeak.total)} · ${topLeak.count} charges · ${Math.round((topLeak.total / expense) * 100)}% of month out.`,
      amount: topLeak.total,
      cta: "Inspect merchant",
      tab: "transactions",
    });
  }

  // ── Runway ──
  if (hasTxs && runwayMonths < 2 && cash > 0) {
    actions.push({
      id: "runway",
      priority: 87,
      severity: "critical",
      title: `Runway under 2 months (${runwayMonths.toFixed(1)})`,
      detail: "At this burn, cash won’t last. Raise income buffer or cut fixed costs.",
      cta: "See runway drivers",
      tab: "overview",
    });
  } else if (hasTxs && runwayMonths < 4 && cash > 0) {
    actions.push({
      id: "runway-warn",
      priority: 60,
      severity: "medium",
      title: `Runway ${runwayMonths.toFixed(1)} months`,
      detail: "Thin cushion. Aim for 6+ months cash for stability.",
      cta: "Goals → emergency fund",
      tab: "goals",
    });
  }

  // ── Goals stuck ──
  for (const g of goals) {
    if (g.target > 0 && g.saved / g.target < 0.15 && cashFlow > 0) {
      actions.push({
        id: `goal-${g.id}`,
        priority: 40,
        severity: "low",
        title: `Underfunded: ${g.name}`,
        detail: `${Math.round((g.saved / g.target) * 100)}% funded. Positive cash flow could route here automatically next month.`,
        cta: "Open goals",
        tab: "goals",
      });
    }
  }

  // ── Good state ──
  if (!actions.length && hasTxs) {
    actions.push({
      id: "good",
      priority: 1,
      severity: "good",
      title: "System stable this period",
      detail: `Flow ${money(cashFlow)} · Safe ${money(safeToSpend)} · Projected month-end flow ${money(projection.projectedFlow)}.`,
      cta: "Keep logging",
      tab: "overview",
    });
  }

  actions.sort((a, b) => b.priority - a.priority);

  // Headline — honest
  let headline = "Money desk is cold";
  let sub = "Import bank data so the engine can think.";
  if (quality >= 70 && planHealth === "ok" && cashFlow >= 0) {
    headline = "In control";
    sub = `Safe to deploy ~${money(safeToSpend)}. Projected month-end flow ${money(projection.projectedFlow)}.`;
  } else if (quality >= 40 && actions[0]?.severity === "critical") {
    headline = "Act on the top risk";
    sub = actions[0].title;
  } else if (quality >= 40) {
    headline = "Partial picture — still actionable";
    sub = actions[0]
      ? actions[0].title
      : `Tracking ${txs.length} transactions this device.`;
  } else if (hasTxs) {
    headline = "Signals forming";
    sub = "Add plan + card limits to unlock full decisions.";
  }

  return {
    headline,
    sub,
    actions: actions.slice(0, 6),
    projection,
    safeToSpend,
    runwayMonths,
    topLeak,
    planHealth,
    dataQuality: {
      hasTxs,
      hasIncome,
      hasAccounts,
      hasLimits,
      hasPlan,
      score: quality,
    },
  };
}

/** Context-aware answers from the live brief — not keyword theater */
export function answerFromBrief(
  question: string,
  brief: SmartBrief,
  extras: {
    worth: number;
    cash: number;
    debt: number;
    income: number;
    expense: number;
    cashFlow: number;
    rate: number | null;
    credit: CreditReport;
    txCount: number;
  }
): string {
  const q = question.toLowerCase().trim();
  if (!q) return "Ask a real money question — afford, runway, credit, or what to cut.";

  if (!brief.dataQuality.hasTxs) {
    return "I don't have transactions yet. Import a bank CSV (Accounts) or Load demo — then I can answer with numbers, not vibes.";
  }

  if (/(afford|trip|buy|purchase|spend \$?\d)/.test(q)) {
    const m = q.match(/\$?\s*([\d,]+)/);
    const want = m ? Number(m[1].replace(/,/g, "")) : null;
    if (want != null && !Number.isNaN(want)) {
      if (want <= brief.safeToSpend) {
        return `Yes, within safe-to-spend (${money(brief.safeToSpend)}). Still leaves runway ~${brief.runwayMonths > 20 ? "20+" : brief.runwayMonths.toFixed(1)} months at current burn. Don't put it on a card above 30% utilization.`;
      }
      if (want <= extras.cash) {
        return `You have the cash (${money(extras.cash)}) but it exceeds safe-to-spend (${money(brief.safeToSpend)}). Doing it would stress essentials/debt buffer. Better: delay, or cut ${brief.topLeak ? brief.topLeak.merchant : "top merchant"} first.`;
      }
      return `Not safely. Need ~${money(want)} vs safe ${money(brief.safeToSpend)} and cash ${money(extras.cash)}. Projected month-end flow ${money(brief.projection.projectedFlow)}.`;
    }
    return `Safe to spend now: ${money(brief.safeToSpend)}. Cash ${money(extras.cash)}. If you name a dollar amount I'll judge it hard.`;
  }

  if (/credit|score|fico|utilization/.test(q)) {
    const u =
      extras.credit.utilization == null
        ? "unknown (add card limits)"
        : `${Math.round(extras.credit.utilization * 100)}%`;
    const tip = extras.credit.tips[0];
    return `Educational health ${extras.credit.estimate} (${extras.credit.band}), not a bureau FICO. Utilization ${u}. ${tip ? `Next move: ${tip.title} — ${tip.how}` : ""}`;
  }

  if (/runway|broke|last|survive/.test(q)) {
    return `Runway ~${brief.runwayMonths > 20 ? "20+" : brief.runwayMonths.toFixed(1)} months at ${money(brief.projection.burnPerDay)}/day burn. Cash ${money(extras.cash)}. ${brief.runwayMonths < 3 ? "Critical — cut fixed costs or raise income this week." : "Build toward 6+ months."}`;
  }

  if (/cut|save|reduce|leak|merchant/.test(q)) {
    if (brief.topLeak) {
      return `Biggest leak: ${brief.topLeak.merchant} (${money(brief.topLeak.total)}, ${brief.topLeak.count}×). That's the first place to cut. Plan health: ${brief.planHealth}.`;
    }
    return `No dominant merchant yet. Auto-build a plan and import more history so concentration shows up.`;
  }

  if (/project|end of month|forecast|will i/.test(q)) {
    const p = brief.projection;
    return `By month-end (day ${p.dayOfMonth}/${p.daysInMonth}): projected out ~${money(p.projectedSpend)}, in ~${money(p.projectedIncome)}, flow ~${money(p.projectedFlow)}. Based on linear pace from actuals — not magic.`;
  }

  // Default: ranked action
  const top = brief.actions[0];
  return `${brief.headline}. ${brief.sub} Net ${money(extras.worth)} · Flow ${money(extras.cashFlow)} · ${extras.txCount} txs. Top action: ${top?.title ?? "Keep data fresh"}. ${top?.detail ?? ""}`;
}
