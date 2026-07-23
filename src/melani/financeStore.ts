/**
 * Personal finance data for Wonder Finances page.
 * Lives in localStorage only — your numbers stay on this device.
 */

export type AccountKind = "cash" | "checking" | "savings" | "credit" | "invest" | "other";

export type FinanceAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Balance (credit = what you owe; invest/cash = what you have) */
  balance: number;
};

export type TxKind = "expense" | "income";

export type FinanceTx = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: TxKind;
  amount: number;
  category: string;
  note: string;
};

export type BudgetLine = {
  category: string;
  planned: number;
};

export type FinanceState = {
  accounts: FinanceAccount[];
  txs: FinanceTx[];
  budget: BudgetLine[];
  /** Tickers for the mini quote strip */
  watchlist: string[];
};

const KEY = "wonder-finance-v1";

const DEFAULT_BUDGET: BudgetLine[] = [
  { category: "Rent / housing", planned: 0 },
  { category: "Food", planned: 0 },
  { category: "Transport", planned: 0 },
  { category: "Health", planned: 0 },
  { category: "Build / tools", planned: 0 },
  { category: "Fun", planned: 0 },
  { category: "Other", planned: 0 },
];

const DEFAULT_ACCOUNTS: FinanceAccount[] = [
  { id: "acc-checking", name: "Checking", kind: "checking", balance: 0 },
  { id: "acc-savings", name: "Savings", kind: "savings", balance: 0 },
  { id: "acc-cash", name: "Cash", kind: "cash", balance: 0 },
  { id: "acc-credit", name: "Credit card", kind: "credit", balance: 0 },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadFinance(): FinanceState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {
        accounts: DEFAULT_ACCOUNTS,
        txs: [],
        budget: DEFAULT_BUDGET,
        watchlist: ["SPY", "QQQ", "AAPL", "NVDA"],
      };
    }
    const parsed = JSON.parse(raw) as Partial<FinanceState>;
    return {
      accounts: Array.isArray(parsed.accounts) && parsed.accounts.length
        ? parsed.accounts
        : DEFAULT_ACCOUNTS,
      txs: Array.isArray(parsed.txs) ? parsed.txs : [],
      budget:
        Array.isArray(parsed.budget) && parsed.budget.length
          ? parsed.budget
          : DEFAULT_BUDGET,
      watchlist:
        Array.isArray(parsed.watchlist) && parsed.watchlist.length
          ? parsed.watchlist
          : ["SPY", "QQQ", "AAPL", "NVDA"],
    };
  } catch {
    return {
      accounts: DEFAULT_ACCOUNTS,
      txs: [],
      budget: DEFAULT_BUDGET,
      watchlist: ["SPY", "QQQ", "AAPL", "NVDA"],
    };
  }
}

export function saveFinance(state: FinanceState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore full storage */
  }
}

/** Assets minus credit balances you owe */
export function netWorth(accounts: FinanceAccount[]): number {
  let assets = 0;
  let debt = 0;
  for (const a of accounts) {
    if (a.kind === "credit") debt += Math.max(0, a.balance);
    else assets += a.balance;
  }
  return assets - debt;
}

export function cashOnHand(accounts: FinanceAccount[]): number {
  return accounts
    .filter((a) => a.kind === "cash" || a.kind === "checking" || a.kind === "savings")
    .reduce((s, a) => s + a.balance, 0);
}

export function creditOwed(accounts: FinanceAccount[]): number {
  return accounts
    .filter((a) => a.kind === "credit")
    .reduce((s, a) => s + Math.max(0, a.balance), 0);
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function txsInMonth(txs: FinanceTx[], ym: string): FinanceTx[] {
  return txs.filter((t) => t.date.startsWith(ym));
}

export function spentByCategory(txs: FinanceTx[], ym: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txsInMonth(txs, ym)) {
    if (t.kind !== "expense") continue;
    out[t.category] = (out[t.category] || 0) + t.amount;
  }
  return out;
}

export function monthIncome(txs: FinanceTx[], ym: string): number {
  return txsInMonth(txs, ym)
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amount, 0);
}

export function monthExpense(txs: FinanceTx[], ym: string): number {
  return txsInMonth(txs, ym)
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amount, 0);
}

export function newAccount(partial?: Partial<FinanceAccount>): FinanceAccount {
  return {
    id: uid("acc"),
    name: partial?.name || "New account",
    kind: partial?.kind || "other",
    balance: partial?.balance ?? 0,
  };
}

export function newTx(partial?: Partial<FinanceTx>): FinanceTx {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: uid("tx"),
    date: partial?.date || today,
    kind: partial?.kind || "expense",
    amount: partial?.amount ?? 0,
    category: partial?.category || "Other",
    note: partial?.note || "",
  };
}

export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return (
    sign +
    abs.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    })
  );
}

export function moneyExact(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
