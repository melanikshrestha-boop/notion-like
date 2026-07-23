/**
 * Credit health estimator for Wonder Finances.
 *
 * HONEST: This is NOT your official FICO / VantageScore from Equifax,
 * Experian, or TransUnion. Real bureau scores need a credit pull
 * (Credit Karma, AnnualCreditReport, your bank app, etc.).
 *
 * This models the SAME levers those scores care about so you can practice
 * and get concrete tips while your real score climbs.
 */

import type { FinanceAccount } from "./financeStore";

export type CreditProfile = {
  /** 0–100: % of payments on time (you know your truth) */
  onTimePct: number;
  /** Years of credit history */
  historyYears: number;
  /** Hard inquiries in last 12 months */
  hardInquiries: number;
  /** Total credit cards / loans you have open */
  openAccounts: number;
  /** Ever 30+ days late in last 2 years? */
  recentLates: number;
  /** Collections / charge-offs open */
  collections: number;
  /** Self-reported score if you know it (optional) */
  knownScore?: number | null;
};

export type CreditFactor = {
  id: string;
  label: string;
  weight: number; // % of model
  score: number; // 0–100 for this factor
  detail: string;
  status: "good" | "ok" | "bad";
};

export type CreditTip = {
  priority: "now" | "this_month" | "this_year";
  title: string;
  why: string;
  how: string;
};

export type CreditReport = {
  /** Educational 300–850 style number */
  estimate: number;
  band: "Poor" | "Fair" | "Good" | "Very good" | "Excellent";
  factors: CreditFactor[];
  tips: CreditTip[];
  utilization: number | null; // 0–1 or null if no limits
  disclaimer: string;
};

export const DEFAULT_CREDIT_PROFILE: CreditProfile = {
  onTimePct: 90,
  historyYears: 3,
  hardInquiries: 2,
  openAccounts: 3,
  recentLates: 0,
  collections: 0,
  knownScore: null,
};

const DISCLAIMER =
  "Educational estimate only — not your official FICO or VantageScore. Pull free reports at AnnualCreditReport.com or check your bank / Credit Karma for the real number.";

function band(score: number): CreditReport["band"] {
  if (score >= 800) return "Excellent";
  if (score >= 740) return "Very good";
  if (score >= 670) return "Good";
  if (score >= 580) return "Fair";
  return "Poor";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Utilization from credit accounts that have a limit set */
export function creditUtilization(accounts: FinanceAccount[]): {
  used: number;
  limit: number;
  ratio: number | null;
} {
  let used = 0;
  let limit = 0;
  for (const a of accounts) {
    if (a.kind !== "credit") continue;
    used += Math.max(0, a.balance);
    const lim = a.creditLimit ?? 0;
    if (lim > 0) limit += lim;
  }
  if (limit <= 0) return { used, limit: 0, ratio: null };
  return { used, limit, ratio: used / limit };
}

function utilScore(ratio: number | null): { score: number; detail: string; status: CreditFactor["status"] } {
  if (ratio == null) {
    return {
      score: 55,
      detail: "Add credit limits on your cards so we can measure utilization (biggest easy win).",
      status: "ok",
    };
  }
  const pct = Math.round(ratio * 100);
  if (ratio <= 0.09)
    return { score: 98, detail: `${pct}% used — under 10% is elite.`, status: "good" };
  if (ratio <= 0.29)
    return { score: 88, detail: `${pct}% used — under 30% is the classic goal.`, status: "good" };
  if (ratio <= 0.49)
    return { score: 65, detail: `${pct}% used — get under 30% before statement close.`, status: "ok" };
  if (ratio <= 0.74)
    return { score: 40, detail: `${pct}% used — high. Pay down hard.`, status: "bad" };
  return { score: 15, detail: `${pct}% used — maxed stress. Pay ASAP.`, status: "bad" };
}

/**
 * Build educational credit health report from profile + account balances.
 */
export function buildCreditReport(
  profile: CreditProfile,
  accounts: FinanceAccount[]
): CreditReport {
  const util = creditUtilization(accounts);
  const u = utilScore(util.ratio);

  // Payment history (~35% of real models)
  const pay = clamp(profile.onTimePct, 0, 100);
  const payFactor: CreditFactor = {
    id: "payment",
    label: "Payment history",
    weight: 35,
    score: pay,
    detail:
      pay >= 95
        ? "On-time streak looks strong."
        : pay >= 80
          ? "Mostly on time — one miss still hurts for years."
          : "Missed payments are the #1 score killer. Autopay minimums now.",
    status: pay >= 95 ? "good" : pay >= 80 ? "ok" : "bad",
  };

  // Amounts owed / utilization (~30%)
  const utilFactor: CreditFactor = {
    id: "util",
    label: "Credit utilization",
    weight: 30,
    score: u.score,
    detail: u.detail,
    status: u.status,
  };

  // Length of history (~15%)
  const years = Math.max(0, profile.historyYears);
  const histScore =
    years >= 10 ? 95 : years >= 7 ? 85 : years >= 4 ? 70 : years >= 2 ? 55 : years >= 1 ? 40 : 25;
  const histFactor: CreditFactor = {
    id: "history",
    label: "Length of credit",
    weight: 15,
    score: histScore,
    detail:
      years < 2
        ? "Young file — keep oldest cards open, use lightly."
        : years < 7
          ? `${years} years — time is helping. Don’t close old cards.`
          : `${years} years — solid history depth.`,
    status: years >= 4 ? "good" : years >= 2 ? "ok" : "bad",
  };

  // New credit / inquiries (~10%)
  const inq = Math.max(0, profile.hardInquiries);
  const inqScore = inq === 0 ? 95 : inq === 1 ? 80 : inq === 2 ? 65 : inq === 3 ? 45 : 25;
  const inqFactor: CreditFactor = {
    id: "new",
    label: "New credit / inquiries",
    weight: 10,
    score: inqScore,
    detail:
      inq <= 1
        ? "Inquiries look calm."
        : `${inq} hard pulls in 12 months — freeze new apps for a while.`,
    status: inq <= 1 ? "good" : inq <= 2 ? "ok" : "bad",
  };

  // Mix + damage flags (~10%)
  const hasCredit = accounts.some((a) => a.kind === "credit");
  const openN = Math.max(profile.openAccounts, accounts.filter((a) => a.kind === "credit").length);
  let mixScore = openN >= 2 && hasCredit ? 80 : openN >= 1 ? 60 : 35;
  if (profile.recentLates > 0) mixScore = Math.min(mixScore, 40);
  if (profile.collections > 0) mixScore = Math.min(mixScore, 20);
  const mixFactor: CreditFactor = {
    id: "mix",
    label: "Mix & damage flags",
    weight: 10,
    score: mixScore,
    detail:
      profile.collections > 0
        ? "Open collections crush scores — settle / pay-for-delete plan."
        : profile.recentLates > 0
          ? "Recent lates — stay perfect for the next 12 months."
          : openN >= 2
            ? "Healthy mix of accounts."
            : "Thin file — one well-used card over time helps.",
    status:
      profile.collections > 0 || profile.recentLates > 2
        ? "bad"
        : mixScore >= 70
          ? "good"
          : "ok",
  };

  const factors = [payFactor, utilFactor, histFactor, inqFactor, mixFactor];
  const weighted =
    factors.reduce((s, f) => s + (f.score / 100) * f.weight, 0) / 100;
  // Map 0–1 factor blend → 300–850
  let estimate = Math.round(300 + weighted * 550);
  // If they know real score, blend slightly so tips still matter but number feels real
  if (profile.knownScore && profile.knownScore >= 300 && profile.knownScore <= 850) {
    estimate = Math.round(profile.knownScore * 0.7 + estimate * 0.3);
  }
  estimate = clamp(estimate, 300, 850);

  const tips = buildTips(profile, util.ratio, factors);

  return {
    estimate,
    band: band(estimate),
    factors,
    tips,
    utilization: util.ratio,
    disclaimer: DISCLAIMER,
  };
}

function buildTips(
  profile: CreditProfile,
  utilRatio: number | null,
  factors: CreditFactor[]
): CreditTip[] {
  const tips: CreditTip[] = [];

  if (utilRatio == null) {
    tips.push({
      priority: "now",
      title: "Enter every card’s credit limit",
      why: "Utilization is ~30% of score math. Without limits we can’t coach pay-downs.",
      how: "Accounts tab → Type = Credit → fill Limit next to each card balance.",
    });
  } else if (utilRatio > 0.3) {
    const need = Math.ceil((utilRatio - 0.29) * 100);
    tips.push({
      priority: "now",
      title: `Get utilization under 30% (you’re high by ~${need} pts of limit)`,
      why: "This is the fastest lever that moves a score in weeks, not years.",
      how: "Pay before statement closing date — not just due date. Split payments mid-cycle if needed.",
    });
  } else if (utilRatio > 0.1) {
    tips.push({
      priority: "this_month",
      title: "Push utilization under 10%",
      why: "Under 10% is where excellent files often sit.",
      how: "Leave a small charge, pay rest before the statement cuts.",
    });
  }

  if (profile.onTimePct < 100) {
    tips.push({
      priority: "now",
      title: "Autopay at least the minimum on every card",
      why: "One 30-day late can dunk a score 60–110 points and stick ~7 years.",
      how: "Bank app → Autopay → Minimum or full balance. Calendar alarm 2 days before due.",
    });
  }

  if (profile.hardInquiries >= 2) {
    tips.push({
      priority: "this_month",
      title: "Stop new credit applications",
      why: "Each hard pull can nick a few points; clusters look risky.",
      how: "No store cards, no ‘instant approve’ checkout. Wait 6–12 months.",
    });
  }

  if (profile.collections > 0) {
    tips.push({
      priority: "now",
      title: "Attack collections first",
      why: "Open collections signal serious risk to lenders.",
      how: "Get the debt in writing. Negotiate pay-for-delete or settlement. Get it in writing before you pay.",
    });
  }

  if (profile.historyYears < 3) {
    tips.push({
      priority: "this_year",
      title: "Keep your oldest card open forever",
      why: "Average age of accounts grows only if you don’t close old lines.",
      how: "Buy something tiny every few months so the issuer doesn’t shut it.",
    });
  }

  if (profile.recentLates > 0) {
    tips.push({
      priority: "now",
      title: "Build a perfect 12-month streak",
      why: "Recent history weighs more than ancient history.",
      how: "Zero lates for a year. Goodwill letter after 12 clean months sometimes works.",
    });
  }

  // Always useful baseline tips if list short
  if (tips.length < 3) {
    tips.push({
      priority: "this_year",
      title: "Pull free official reports (not a guess)",
      why: "Errors on reports are common and free to dispute.",
      how: "AnnualCreditReport.com (all 3 bureaus). Dispute wrong late marks online.",
    });
    tips.push({
      priority: "this_month",
      title: "Use credit, don’t carry balances",
      why: "You need activity + low utilization — not debt.",
      how: "One recurring bill on a card, autopay full balance monthly.",
    });
  }

  // Sort: now → month → year
  const order = { now: 0, this_month: 1, this_year: 2 };
  tips.sort((a, b) => order[a.priority] - order[b.priority]);
  return tips.slice(0, 6);
}
