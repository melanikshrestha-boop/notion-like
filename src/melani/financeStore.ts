/**
 * Personal finance ledger for Wonder Finances.
 * Mintable-inspired: every transaction, every account, local-first.
 * Optional Plaid when keys are set. Numbers stay on this device by default.
 */

export type AccountKind =
  | "cash"
  | "checking"
  | "savings"
  | "credit"
  | "invest"
  | "other";

export type FinanceAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Balance (credit = amount owed) */
  balance: number;
  /** Institution label e.g. Chase */
  institution?: string;
  /** Plaid account id when linked */
  plaidAccountId?: string | null;
  /** Last sync time ISO */
  lastSyncAt?: string | null;
  /** Masked account number last4 */
  mask?: string | null;
};

export type TxKind = "expense" | "income";
export type TxSource = "manual" | "csv" | "plaid" | "import";

export type FinanceTx = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: TxKind;
  amount: number; // always positive; kind decides direction
  category: string;
  note: string;
  /** Cleaned merchant / payee */
  merchant?: string;
  accountId?: string | null;
  source?: TxSource;
  /** Dedupe key from bank/csv */
  externalId?: string | null;
  pending?: boolean;
};

export type BudgetLine = {
  category: string;
  planned: number;
};

export type PlaidLinkMeta = {
  itemId?: string;
  institutionName?: string;
  linkedAt?: string;
};

export type FinanceState = {
  version: 2;
  accounts: FinanceAccount[];
  txs: FinanceTx[];
  budget: BudgetLine[];
  watchlist: string[];
  /** Optional Plaid item metadata (tokens never stored in localStorage) */
  plaidMeta?: PlaidLinkMeta | null;
};

const KEY = "wonder-finance-v2";
const KEY_V1 = "wonder-finance-v1";

const DEFAULT_BUDGET: BudgetLine[] = [
  { category: "Rent / housing", planned: 0 },
  { category: "Utilities", planned: 0 },
  { category: "Food / groceries", planned: 0 },
  { category: "Restaurants / coffee", planned: 0 },
  { category: "Transport", planned: 0 },
  { category: "Health", planned: 0 },
  { category: "Shopping", planned: 0 },
  { category: "Subscriptions", planned: 0 },
  { category: "Build / tools", planned: 0 },
  { category: "Travel", planned: 0 },
  { category: "Fun", planned: 0 },
  { category: "Transfers", planned: 0 },
  { category: "Fees", planned: 0 },
  { category: "Other", planned: 0 },
  { category: "Uncategorized", planned: 0 },
];

const DEFAULT_ACCOUNTS: FinanceAccount[] = [
  { id: "acc-checking", name: "Checking", kind: "checking", balance: 0 },
  { id: "acc-savings", name: "Savings", kind: "savings", balance: 0 },
  { id: "acc-cash", name: "Cash", kind: "cash", balance: 0 },
  { id: "acc-credit", name: "Credit card", kind: "credit", balance: 0 },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultState(): FinanceState {
  return {
    version: 2,
    accounts: DEFAULT_ACCOUNTS,
    txs: [],
    budget: DEFAULT_BUDGET,
    watchlist: ["SPY", "QQQ", "AAPL", "NVDA"],
    plaidMeta: null,
  };
}

function migrateTx(raw: Partial<FinanceTx>): FinanceTx {
  return {
    id: raw.id || uid("tx"),
    date: raw.date || new Date().toISOString().slice(0, 10),
    kind: raw.kind === "income" ? "income" : "expense",
    amount: Math.abs(Number(raw.amount) || 0),
    category: raw.category || "Uncategorized",
    note: raw.note || "",
    merchant: raw.merchant || raw.note || "",
    accountId: raw.accountId ?? null,
    source: raw.source || "manual",
    externalId: raw.externalId ?? null,
    pending: !!raw.pending,
  };
}

export function loadFinance(): FinanceState {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      // upgrade from v1 if present
      const v1 = localStorage.getItem(KEY_V1);
      if (v1) {
        const old = JSON.parse(v1) as Partial<FinanceState>;
        const next: FinanceState = {
          version: 2,
          accounts: Array.isArray(old.accounts) && old.accounts.length
            ? old.accounts
            : DEFAULT_ACCOUNTS,
          txs: Array.isArray(old.txs) ? old.txs.map(migrateTx) : [],
          budget:
            Array.isArray(old.budget) && old.budget.length
              ? old.budget
              : DEFAULT_BUDGET,
          watchlist:
            Array.isArray(old.watchlist) && old.watchlist.length
              ? old.watchlist
              : ["SPY", "QQQ", "AAPL", "NVDA"],
          plaidMeta: null,
        };
        saveFinance(next);
        return next;
      }
      return defaultState();
    }
    const parsed = JSON.parse(raw) as Partial<FinanceState>;
    return {
      version: 2,
      accounts:
        Array.isArray(parsed.accounts) && parsed.accounts.length
          ? parsed.accounts
          : DEFAULT_ACCOUNTS,
      txs: Array.isArray(parsed.txs) ? parsed.txs.map(migrateTx) : [],
      budget:
        Array.isArray(parsed.budget) && parsed.budget.length
          ? parsed.budget
          : DEFAULT_BUDGET,
      watchlist:
        Array.isArray(parsed.watchlist) && parsed.watchlist.length
          ? parsed.watchlist
          : ["SPY", "QQQ", "AAPL", "NVDA"],
      plaidMeta: parsed.plaidMeta || null,
    };
  } catch {
    return defaultState();
  }
}

export function saveFinance(state: FinanceState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, version: 2 }));
  } catch {
    /* ignore */
  }
}

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
    .filter(
      (a) =>
        a.kind === "cash" || a.kind === "checking" || a.kind === "savings"
    )
    .reduce((s, a) => s + a.balance, 0);
}

export function creditOwed(accounts: FinanceAccount[]): number {
  return accounts
    .filter((a) => a.kind === "credit")
    .reduce((s, a) => s + Math.max(0, a.balance), 0);
}

export function invested(accounts: FinanceAccount[]): number {
  return accounts
    .filter((a) => a.kind === "invest")
    .reduce((s, a) => s + a.balance, 0);
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function txsInMonth(txs: FinanceTx[], ym: string): FinanceTx[] {
  return txs.filter((t) => t.date.startsWith(ym));
}

export function spentByCategory(
  txs: FinanceTx[],
  ym: string
): Record<string, number> {
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

/** Top merchants by spend this month */
export function topMerchants(
  txs: FinanceTx[],
  ym: string,
  limit = 12
): { merchant: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txsInMonth(txs, ym)) {
    if (t.kind !== "expense") continue;
    const m = (t.merchant || t.note || "Unknown").trim() || "Unknown";
    const cur = map.get(m) || { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    map.set(m, cur);
  }
  return [...map.entries()]
    .map(([merchant, v]) => ({ merchant, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function fingerprintsFromTxs(txs: FinanceTx[]): Set<string> {
  const set = new Set<string>();
  for (const t of txs) {
    if (t.externalId) set.add(t.externalId);
  }
  return set;
}

/** Merge new txs, skip duplicates by externalId */
export function mergeTxs(
  existing: FinanceTx[],
  incoming: FinanceTx[]
): { txs: FinanceTx[]; added: number; skipped: number } {
  const fp = fingerprintsFromTxs(existing);
  const ids = new Set(existing.map((t) => t.id));
  let added = 0;
  let skipped = 0;
  const next = [...existing];
  for (const t of incoming) {
    if (t.externalId && fp.has(t.externalId)) {
      skipped++;
      continue;
    }
    if (ids.has(t.id)) {
      skipped++;
      continue;
    }
    if (t.externalId) fp.add(t.externalId);
    ids.add(t.id);
    next.push(t);
    added++;
  }
  // newest first
  next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { txs: next, added, skipped };
}

export function newAccount(partial?: Partial<FinanceAccount>): FinanceAccount {
  return {
    id: uid("acc"),
    name: partial?.name || "New account",
    kind: partial?.kind || "other",
    balance: partial?.balance ?? 0,
    institution: partial?.institution || "",
    plaidAccountId: partial?.plaidAccountId ?? null,
    lastSyncAt: partial?.lastSyncAt ?? null,
    mask: partial?.mask ?? null,
  };
}

export function newTx(partial?: Partial<FinanceTx>): FinanceTx {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: uid("tx"),
    date: partial?.date || today,
    kind: partial?.kind || "expense",
    amount: partial?.amount ?? 0,
    category: partial?.category || "Uncategorized",
    note: partial?.note || "",
    merchant: partial?.merchant || partial?.note || "",
    accountId: partial?.accountId ?? null,
    source: partial?.source || "manual",
    externalId: partial?.externalId ?? null,
    pending: !!partial?.pending,
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

/** Last N calendar months keys YYYY-MM newest first */
export function recentMonthKeys(count = 6): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    out.push(monthKey(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
