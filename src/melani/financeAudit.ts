/**
 * Financial auditing — backend only.
 * Reviews operations for inaccuracies, weak controls, and fraud-ish patterns.
 * Uses the live ledger only. Educational; not a formal audit opinion.
 */

import {
  money,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";

export type AuditFinding = {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  code: string;
  title: string;
  detail: string;
  amount?: number;
  txIds?: string[];
};

export type AuditBrief = {
  score: number; // 0–100 controls health
  findings: AuditFinding[];
  stats: {
    txCount: number;
    uncategorized: number;
    blankPayee: number;
    duplicateSuspects: number;
    roundTrips: number;
    cardPayShare: number;
  };
  order: string;
};

function dayKey(t: FinanceTx): string {
  return t.date;
}

function fingerprint(t: FinanceTx): string {
  return `${t.date}|${t.kind}|${t.amount.toFixed(2)}|${(t.merchant || t.note || "")
    .toLowerCase()
    .slice(0, 40)}`;
}

/**
 * Full-book audit pass on current state.
 */
export function buildAuditBrief(state: FinanceState): AuditBrief {
  const txs = state.txs;
  const findings: AuditFinding[] = [];
  let uncategorized = 0;
  let blankPayee = 0;
  const byFp = new Map<string, FinanceTx[]>();
  let cardPay = 0;
  let expenseTotal = 0;

  for (const t of txs) {
    const cat = (t.category || "").trim();
    if (!cat || cat === "Uncategorized" || cat === "Other") uncategorized += 1;
    if (!(t.merchant || t.note || "").trim()) blankPayee += 1;
    const fp = fingerprint(t);
    const list = byFp.get(fp) || [];
    list.push(t);
    byFp.set(fp, list);
    if (t.kind === "expense") {
      expenseTotal += t.amount;
      if ((t.merchant || "").toLowerCase().includes("chase card payment")) {
        cardPay += t.amount;
      }
    }
  }

  const duplicateSuspects: FinanceTx[] = [];
  for (const [, list] of byFp) {
    if (list.length > 1) duplicateSuspects.push(...list.slice(1));
  }

  if (duplicateSuspects.length > 0) {
    findings.push({
      id: "audit-dupes",
      severity: duplicateSuspects.length > 5 ? "high" : "medium",
      code: "DUP",
      title: `${duplicateSuspects.length} possible duplicate lines`,
      detail:
        "Same date, amount, direction, and payee appears more than once. Could be re-import or real double charge — review and delete ghosts.",
      txIds: duplicateSuspects.slice(0, 12).map((t) => t.id),
    });
  }

  if (uncategorized > 0) {
    findings.push({
      id: "audit-uncat",
      severity: uncategorized > 20 ? "high" : "medium",
      code: "CAT",
      title: `${uncategorized} weak categories (Other/blank)`,
      detail:
        "Audit trail fails when everything is Other. Force a real category on every line before you trust reports.",
    });
  }

  if (blankPayee > 0) {
    findings.push({
      id: "audit-payee",
      severity: "medium",
      code: "PAY",
      title: `${blankPayee} lines with blank payee`,
      detail: "A bookkeeper never posts without a name. Fill payee for every entry.",
    });
  }

  // Round-trip: money out and back same day similar amount (possible window-dressing or error)
  let roundTrips = 0;
  const byDay = new Map<string, FinanceTx[]>();
  for (const t of txs) {
    const k = dayKey(t);
    const list = byDay.get(k) || [];
    list.push(t);
    byDay.set(k, list);
  }
  for (const [day, list] of byDay) {
    const outs = list.filter((t) => t.kind === "expense");
    const ins = list.filter((t) => t.kind === "income");
    for (const o of outs) {
      for (const i of ins) {
        if (Math.abs(o.amount - i.amount) < 0.02) {
          roundTrips += 1;
          findings.push({
            id: `audit-rt-${day}-${o.id}`,
            severity: "low",
            code: "RT",
            title: `Same-day round trip ${money(o.amount)} on ${day}`,
            detail: `${o.merchant || "out"} ↔ ${i.merchant || "in"}. Often family reimburse or transfer; confirm it is intentional.`,
            amount: o.amount,
            txIds: [o.id, i.id],
          });
        }
      }
    }
  }
  // Cap RT findings noise
  const rtFindings = findings.filter((f) => f.code === "RT");
  if (rtFindings.length > 4) {
    for (const f of rtFindings.slice(4)) {
      const idx = findings.indexOf(f);
      if (idx >= 0) findings.splice(idx, 1);
    }
    findings.push({
      id: "audit-rt-many",
      severity: "medium",
      code: "RT",
      title: `${roundTrips} same-day equal in/out pairs`,
      detail:
        "Many mirror transfers. Normal for card pay + family Zelle patterns on your books — still verify none are mistakes.",
    });
  }

  const cardPayShare = expenseTotal > 0 ? cardPay / expenseTotal : 0;
  if (cardPayShare > 0.55) {
    findings.push({
      id: "audit-opaque-cc",
      severity: "critical",
      code: "OPAQUE",
      title: `${Math.round(cardPayShare * 100)}% of outflows are card payments`,
      detail: `${money(cardPay)} pays the Chase card, not merchants. Audit of lifestyle is blind without card-level detail. Import card PDFs/CSV next.`,
      amount: cardPay,
    });
  }

  // Orphan accounts: credit with no limit
  for (const a of state.accounts) {
    if (a.kind === "credit" && a.balance > 0 && !(a.creditLimit && a.creditLimit > 0)) {
      findings.push({
        id: `audit-limit-${a.id}`,
        severity: "high",
        code: "LIM",
        title: `${a.name}: balance without limit`,
        detail: "Cannot compute utilization or debt control. Set the credit limit.",
        amount: a.balance,
      });
    }
  }

  // Future-dated lines
  const today = new Date().toISOString().slice(0, 10);
  const future = txs.filter((t) => t.date > today);
  if (future.length) {
    findings.push({
      id: "audit-future",
      severity: "medium",
      code: "DATE",
      title: `${future.length} future-dated lines`,
      detail: "Dates after today break period close. Fix typos.",
      txIds: future.slice(0, 8).map((t) => t.id),
    });
  }

  // Negative amounts shouldn't exist (we store absolute + kind)
  // Large single outflow vs median
  const expenses = txs.filter((t) => t.kind === "expense").map((t) => t.amount);
  if (expenses.length > 10) {
    const sorted = [...expenses].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] || 1;
    const outliers = txs.filter(
      (t) => t.kind === "expense" && t.amount > med * 8 && t.amount > 200
    );
    if (outliers.length) {
      findings.push({
        id: "audit-outlier",
        severity: "medium",
        code: "OUT",
        title: `${outliers.length} large outlier expenses`,
        detail: `Vs median ~${money(med)}. Largest: ${outliers
          .slice()
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3)
          .map((t) => `${t.merchant || "?"} ${money(t.amount)}`)
          .join("; ")}. Confirm legitimate.`,
        amount: outliers[0]?.amount,
        txIds: outliers.slice(0, 6).map((t) => t.id),
      });
    }
  }

  if (txs.length === 0) {
    findings.push({
      id: "audit-empty",
      severity: "critical",
      code: "EMPTY",
      title: "No transactions to audit",
      detail: "Import bank data before any control testing.",
    });
  }

  // Score
  let score = 100;
  for (const f of findings) {
    if (f.severity === "critical") score -= 22;
    else if (f.severity === "high") score -= 14;
    else if (f.severity === "medium") score -= 8;
    else if (f.severity === "low") score -= 3;
  }
  score = Math.max(0, Math.min(100, score));

  findings.sort((a, b) => {
    const rank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    return rank[b.severity] - rank[a.severity];
  });

  const top = findings[0];
  const order = top
    ? `${top.code}: ${top.title}`
    : "Books pass basic control checks — keep daily posts clean.";

  return {
    score,
    findings: findings.slice(0, 12),
    stats: {
      txCount: txs.length,
      uncategorized,
      blankPayee,
      duplicateSuspects: duplicateSuspects.length,
      roundTrips,
      cardPayShare,
    },
    order,
  };
}

export function answerAudit(question: string, audit: AuditBrief): string | null {
  const q = question.toLowerCase();
  if (!/(audit|fraud|error|inaccur|control|duplicate|mistake|mess)/.test(q))
    return null;
  const top = audit.findings[0];
  return (
    `Audit health ${audit.score}/100. ` +
    `${audit.stats.txCount} lines · ${audit.stats.uncategorized} weak cats · ${audit.stats.duplicateSuspects} dupe suspects · ` +
    `card-pay share ${Math.round(audit.stats.cardPayShare * 100)}%. ` +
    `Order: ${audit.order}` +
    (top ? ` Detail: ${top.detail}` : "")
  );
}
