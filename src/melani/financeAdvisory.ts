/**
 * Advisory services — backend only.
 * Guides decisions: hiring, equipment, restructuring, lifestyle, reinvest.
 * Grounded only in current books + reinvest/audit/tax/forecast signals.
 */

import {
  cashOnHand,
  creditOwed,
  invested,
  money,
  type FinanceState,
} from "./financeStore";
import type { ReinvestPlan } from "./financeIntelligence";
import type { AuditBrief } from "./financeAudit";
import type { TaxBrief } from "./financeTax";
import type { ForecastBrief } from "./financeForecast";

export type AdvisoryVerdict = "go" | "caution" | "no";

export type AdvisoryDecision = {
  id: string;
  topic: string;
  verdict: AdvisoryVerdict;
  title: string;
  detail: string;
  maxSafeAmount?: number;
};

export type AdvisoryBrief = {
  decisions: AdvisoryDecision[];
  /** Standing counsel */
  standingOrders: string[];
  order: string;
};

function canAfford(
  amount: number,
  cash: number,
  reinvest: ReinvestPlan,
  fc: ForecastBrief
): AdvisoryVerdict {
  if (amount <= 0) return "caution";
  if (fc.avgFlow3 < 0) return "no";
  if (reinvest.deployNow > 0 && amount > reinvest.deployNow * 0.25) return "no";
  if (amount > cash * 0.3) return "caution";
  if (amount > cash) return "no";
  return "go";
}

export function buildAdvisoryBrief(
  state: FinanceState,
  reinvest: ReinvestPlan,
  audit: AuditBrief,
  tax: TaxBrief,
  fc: ForecastBrief
): AdvisoryBrief {
  const cash = cashOnHand(state.accounts);
  const debt = creditOwed(state.accounts);
  const inv = invested(state.accounts);
  const decisions: AdvisoryDecision[] = [];

  // Hire staff (or contractor)
  {
    const monthlyCost = Math.max(3000, fc.avgExpense3 * 0.4); // floor for a helper
    const verdict =
      fc.avgFlow3 > monthlyCost * 1.5 && reinvest.actualRate != null && reinvest.actualRate >= 0.4
        ? "caution"
        : "no";
    decisions.push({
      id: "hire",
      topic: "hiring",
      verdict,
      title:
        verdict === "no"
          ? "Do not hire yet"
          : "Hiring only as contractor with hard cap",
      detail:
        verdict === "no"
          ? `Need stable surplus. 3-mo avg flow ${money(fc.avgFlow3)}; a junior hire burns ~${money(monthlyCost)}+/mo fully loaded. Fix keep-rate and opacity (card spend) first.`
          : `Flow supports a small contractor only if keep-rate stays ≥40% and card-level books exist. Cap trial at 90 days.`,
      maxSafeAmount: verdict === "no" ? 0 : Math.round(fc.avgFlow3 * 0.35),
    });
  }

  // Equipment / tools
  {
    const ticket = 1500;
    const v = canAfford(ticket, cash, reinvest, fc);
    decisions.push({
      id: "equipment",
      topic: "equipment",
      verdict: v,
      title:
        v === "go"
          ? "Small tools OK after reinvest"
          : v === "caution"
            ? "Equipment only if it raises income"
            : "Defer equipment purchases",
      detail:
        v === "no"
          ? `Cash ${money(cash)}, reinvest gap ${money(reinvest.deployNow)}, 3-mo flow ${money(fc.avgFlow3)}. Buy tools only when they unlock billable work — not aesthetics.`
          : `Up to ~${money(Math.min(cash * 0.15, 800))} for income-producing tools after this month’s reinvest is funded.`,
      maxSafeAmount:
        v === "no" ? 0 : Math.round(Math.min(cash * 0.15, Math.max(0, fc.avgFlow3))),
    });
  }

  // Restructure spend
  {
    const opaque = audit.stats.cardPayShare > 0.5;
    decisions.push({
      id: "restructure",
      topic: "restructuring",
      verdict: opaque || fc.avgFlow3 < 0 ? "go" : "caution",
      title: opaque
        ? "Restructure visibility first"
        : "Restructure toward 70% keep",
      detail: opaque
        ? `${Math.round(audit.stats.cardPayShare * 100)}% of checking outflows are card payments. Restructure: import card ledger, freeze new subscriptions, route surplus to Invest automatically.`
        : `Push keep-rate from ${reinvest.actualRate == null ? "?" : `${Math.round(reinvest.actualRate * 100)}%`} toward ${Math.round(reinvest.targetRate * 100)}%. Cut Zelle lifestyle and non-essential merchants before any expansion.`,
    });
  }

  // Lifestyle / discretionary
  {
    const fun = Math.max(0, cash - reinvest.deployNow - debt * 0.05);
    decisions.push({
      id: "lifestyle",
      topic: "lifestyle",
      verdict: reinvest.deployNow > 0 ? "no" : fun > 100 ? "caution" : "no",
      title:
        reinvest.deployNow > 0
          ? "No lifestyle upgrades until capital is posted"
          : "Lifestyle residual only",
      detail: `Reinvest gap ${money(reinvest.deployNow)}. Fun residual ~${money(fun)} after capital doctrine. Ruthless rule: boredom spending is a tax on your future self.`,
      maxSafeAmount: reinvest.deployNow > 0 ? 0 : Math.round(fun * 0.25),
    });
  }

  // Debt vs invest
  {
    decisions.push({
      id: "debt-vs-invest",
      topic: "capital",
      verdict: debt > 500 ? "go" : "caution",
      title: debt > 500 ? "Attack revolving debt before speculative invest" : "Fund Invest bucket steadily",
      detail:
        debt > 500
          ? `Credit owed ${money(debt)}. Interest is a guaranteed negative return — pay high-APR balances before new risk capital. Then automate transfers to Invest.`
          : `Invest book ${money(inv)}. Automate a fixed transfer on every income day (${Math.round(reinvest.targetRate * 100)}% target).`,
      maxSafeAmount: reinvest.deployNow,
    });
  }

  // Tax structure
  {
    const familyHeavy = tax.buckets.find((b) => b.id === "family");
    decisions.push({
      id: "tax-structure",
      topic: "tax",
      verdict: familyHeavy && familyHeavy.total > tax.ytdGrossIn * 0.5 ? "caution" : "go",
      title: "Separate gift support from earned income",
      detail: tax.order,
    });
  }

  const standingOrders = [
    "Post every dollar the day it moves.",
    "Fund reinvest target before any discretionary spend.",
    "No hire / big gear until 3-month flow is green and books are not card-opaque.",
    "Import credit-card detail so audits and tax categories are real.",
    "Automate Invest transfers on income days.",
  ];

  const worst = decisions.find((d) => d.verdict === "no") || decisions[0];
  return {
    decisions,
    standingOrders,
    order: worst ? `${worst.title}. ${worst.detail}` : standingOrders[0],
  };
}

export function answerAdvisory(
  question: string,
  advisory: AdvisoryBrief
): string | null {
  const q = question.toLowerCase();
  if (
    !/(hire|hiring|staff|employee|equipment|buy|laptop|restructure|should i|advice|advisory|expand|business)/.test(
      q
    )
  ) {
    return null;
  }
  let topic = "lifestyle";
  if (/hire|staff|employee|contractor/.test(q)) topic = "hiring";
  else if (/equipment|laptop|gear|tool|camera/.test(q)) topic = "equipment";
  else if (/restructure|reorg|cut|reduce/.test(q)) topic = "restructuring";
  else if (/tax/.test(q)) topic = "tax";
  else if (/invest|debt|pay off/.test(q)) topic = "capital";

  const d =
    advisory.decisions.find((x) => x.topic === topic) || advisory.decisions[0];
  if (!d) return advisory.order;
  const v =
    d.verdict === "go" ? "GO" : d.verdict === "caution" ? "CAUTION" : "NO";
  return `${v}: ${d.title}. ${d.detail}${
    d.maxSafeAmount != null ? ` Ceiling ~${money(d.maxSafeAmount)}.` : ""
  }`;
}
