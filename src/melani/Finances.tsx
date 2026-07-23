/**
 * Wonder Finances — Microsoft Excel UX.
 * Flat ribbon, formula-style metrics, cell grid, sheet tabs.
 * No rounded cards. Credit tips + bank CSV/Plaid still work.
 * Not financial advice. Credit number is educational, not FICO.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import "./finance.css";
import {
  buildCreditReport,
  DEFAULT_CREDIT_PROFILE,
  type CreditProfile,
} from "./financeCredit";
import { FINANCE_CATEGORIES } from "./financeCategorize";
import { exportLedgerCsv, parseBankCsv } from "./financeCsv";
import {
  cashOnHand,
  creditOwed,
  demoSeedTxs,
  fingerprintsFromTxs,
  invested,
  loadFinance,
  mergeTxs,
  money,
  moneyExact,
  monthExpense,
  monthIncome,
  monthKey,
  monthlySeries,
  netWorth,
  newAccount,
  newGoal,
  newTx,
  recentMonthKeys,
  saveFinance,
  savingsRate,
  spentByCategory,
  topMerchants,
  type AccountKind,
  type FinanceAccount,
  type FinanceState,
  type FinanceTx,
  type TxKind,
} from "./financeStore";

export const FINANCES_PAGE_ID = "pg-finance";

export function isFinancesPage(pageId: string): boolean {
  return pageId === FINANCES_PAGE_ID || pageId === "pg-finances";
}

type Quote = {
  symbol: string;
  price: number | null;
  changePct: number | null;
};

type PlaidStatus = {
  ready: boolean;
  env?: string;
  message?: string;
  setupUrl?: string;
  linkedItems?: number;
};

type TabId =
  | "insights"
  | "ledger"
  | "credit"
  | "budget"
  | "goals"
  | "accounts"
  | "connect";

type SortKey = "date" | "merchant" | "category" | "amount" | "kind";

/** One-tap starter expenses for first-timers */
const QUICK_ADDS: {
  label: string;
  amount: number;
  category: string;
  note: string;
}[] = [
  { label: "Coffee $5", amount: 5, category: "Restaurants / coffee", note: "Coffee" },
  { label: "Transit $3", amount: 2.9, category: "Transport", note: "Transit" },
  { label: "Lunch $15", amount: 15, category: "Restaurants / coffee", note: "Lunch" },
  { label: "Groceries $60", amount: 60, category: "Food / groceries", note: "Groceries" },
];

const KINDS: { id: AccountKind; label: string }[] = [
  { id: "checking", label: "Checking" },
  { id: "savings", label: "Savings" },
  { id: "cash", label: "Cash" },
  { id: "credit", label: "Credit (owe)" },
  { id: "invest", label: "Invest" },
  { id: "other", label: "Other" },
];

function mapQuote(raw: Record<string, unknown>): Quote {
  return {
    symbol: String(raw.symbol || ""),
    price:
      typeof raw.regularMarketPrice === "number"
        ? raw.regularMarketPrice
        : typeof raw.price === "number"
          ? raw.price
          : null,
    changePct:
      typeof raw.regularMarketChangePercent === "number"
        ? raw.regularMarketChangePercent
        : typeof raw.changePct === "number"
          ? raw.changePct
          : null,
  };
}

export function Finances({ onGo }: { onGo?: (pageId: string) => void }) {
  const [state, setState] = useState<FinanceState>(() => loadFinance());
  const [tab, setTab] = useState<TabId>("insights");
  const [showTxForm, setShowTxForm] = useState(false);
  const [txDraft, setTxDraft] = useState(() => newTx());
  const [filterQ, setFilterQ] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterMonth, setFilterMonth] = useState(monthKey());
  const [filterKind, setFilterKind] = useState<"all" | TxKind>("all");
  const [importNote, setImportNote] = useState("");
  const [plaid, setPlaid] = useState<PlaidStatus | null>(null);
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [plaidNote, setPlaidNote] = useState("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [goalDraft, setGoalDraft] = useState(() =>
    newGoal({ name: "Emergency fund", target: 5000 })
  );
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const fileRef = useRef<HTMLInputElement>(null);

  const creditProfile: CreditProfile = useMemo(
    () => ({
      ...DEFAULT_CREDIT_PROFILE,
      ...(state.creditProfile || {}),
    }),
    [state.creditProfile]
  );

  const creditReport = useMemo(
    () => buildCreditReport(creditProfile, state.accounts),
    [creditProfile, state.accounts]
  );

  useEffect(() => {
    saveFinance(state);
  }, [state]);

  // Plaid status
  useEffect(() => {
    void fetch("/api/finance/plaid/status")
      .then((r) => r.json())
      .then((d) => setPlaid(d as PlaidStatus))
      .catch(() =>
        setPlaid({
          ready: false,
          message: "Plaid API offline — CSV import still works.",
        })
      );
  }, []);

  const ym = filterMonth || monthKey();
  const spentMap = useMemo(
    () => spentByCategory(state.txs, ym),
    [state.txs, ym]
  );
  const income = useMemo(() => monthIncome(state.txs, ym), [state.txs, ym]);
  const expense = useMemo(() => monthExpense(state.txs, ym), [state.txs, ym]);
  const worth = netWorth(state.accounts);
  const cash = cashOnHand(state.accounts);
  const debt = creditOwed(state.accounts);
  const inv = invested(state.accounts);
  const cashFlow = income - expense;
  const merchants = useMemo(
    () => topMerchants(state.txs, ym, 10),
    [state.txs, ym]
  );
  const months = useMemo(() => recentMonthKeys(12), []);
  const series = useMemo(() => monthlySeries(state.txs, 6), [state.txs]);
  const rate = useMemo(() => savingsRate(state.txs, ym), [state.txs, ym]);
  const goals = state.goals || [];
  const catSpend = useMemo(() => {
    const entries = Object.entries(spentMap).sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] || 1;
    return entries.slice(0, 8).map(([cat, total]) => ({
      cat,
      total,
      pct: Math.round((total / max) * 100),
    }));
  }, [spentMap]);

  const categories = useMemo(() => {
    const set = new Set<string>([
      ...FINANCE_CATEGORIES,
      ...state.budget.map((b) => b.category),
      ...state.txs.map((t) => t.category),
    ]);
    return Array.from(set);
  }, [state.budget, state.txs]);

  // Full filtered ledger (Sheets-style table source)
  const ledger = useMemo(() => {
    let list = [...state.txs];
    if (filterMonth !== "all") {
      list = list.filter((t) => t.date.startsWith(filterMonth));
    }
    if (filterKind !== "all") list = list.filter((t) => t.kind === filterKind);
    if (filterCat !== "all")
      list = list.filter((t) => t.category === filterCat);
    if (filterQ.trim()) {
      const q = filterQ.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.merchant || "").toLowerCase().includes(q) ||
          (t.note || "").toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q)
      );
    }
    // Sheets-style column sort
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "merchant")
        cmp = (a.merchant || a.note || "").localeCompare(b.merchant || b.note || "");
      else if (sortKey === "category") cmp = a.category.localeCompare(b.category);
      else if (sortKey === "kind") cmp = a.kind.localeCompare(b.kind);
      else cmp = a.amount - b.amount;
      return cmp * dir;
    });
    return list;
  }, [state.txs, filterMonth, filterKind, filterCat, filterQ, sortKey, sortDir]);

  /** Footer totals for visible sheet rows (like =SUM) */
  const ledgerTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of ledger) {
      if (t.kind === "income") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, net: income - expense, count: ledger.length };
  }, [ledger]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "date" || key === "amount" ? "desc" : "asc");
    }
  }

  function patchCreditProfile(patch: Partial<CreditProfile>) {
    setState((s) => ({
      ...s,
      creditProfile: {
        ...DEFAULT_CREDIT_PROFILE,
        ...(s.creditProfile || {}),
        ...patch,
      },
    }));
  }

  /** Paste TSV/CSV from Google Sheets / Excel into the ledger */
  function onLedgerPaste(e: ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !text.includes("\t") && !text.includes("\n")) return;
    // Only intercept multi-cell paste
    if (!text.includes("\n") && !text.includes("\t")) return;
    e.preventDefault();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const added: FinanceTx[] = [];
    for (const line of lines) {
      const cols = line.split("\t").length > 1 ? line.split("\t") : line.split(",");
      // Expected: date | merchant | amount | category? | kind?
      const dateRaw = (cols[0] || "").trim();
      const merchant = (cols[1] || "").trim();
      const amountRaw = (cols[2] || "").replace(/[$,]/g, "").trim();
      const amount = Math.abs(Number(amountRaw));
      if (!amount || Number.isNaN(amount)) continue;
      let date = dateRaw;
      // Accept M/D/YYYY
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateRaw)) {
        const [mm, dd, yy] = dateRaw.split("/");
        const y = yy.length === 2 ? `20${yy}` : yy;
        date = `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = new Date().toISOString().slice(0, 10);
      }
      const kind: TxKind =
        amountRaw.trim().startsWith("-") || (cols[4] || "").toLowerCase().includes("exp")
          ? "expense"
          : (cols[4] || "").toLowerCase().includes("inc")
            ? "income"
            : "expense";
      // Prefer negative amounts as expense (sheets often use - for spend)
      const isNeg = amountRaw.trim().startsWith("-") || Number(amountRaw) < 0;
      added.push(
        newTx({
          date,
          merchant: merchant || "Pasted",
          note: merchant || "Pasted",
          amount,
          category: (cols[3] || "Uncategorized").trim() || "Uncategorized",
          kind: isNeg || kind === "expense" ? "expense" : "income",
          source: "import",
        })
      );
    }
    if (!added.length) {
      setImportNote("Paste failed — use columns: Date · Merchant · Amount · Category");
      return;
    }
    setState((s) => {
      const merged = mergeTxs(s.txs, added);
      return { ...s, txs: merged.txs };
    });
    setImportNote(`Pasted ${added.length} rows from spreadsheet`);
  }

  function addBlankSheetRow() {
    const tx = newTx({
      kind: "expense",
      amount: 0,
      category: "Uncategorized",
      note: "",
      merchant: "",
      source: "manual",
    });
    setState((s) => ({ ...s, txs: [tx, ...s.txs] }));
  }

  const loadQuotes = useCallback(async () => {
    if (!state.watchlist.length) return;
    try {
      const q = state.watchlist.map((s) => encodeURIComponent(s)).join(",");
      const res = await fetch(`/api/market/quote?symbols=${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as { quotes?: Record<string, unknown>[] };
      setQuotes((data.quotes || []).map(mapQuote));
    } catch {
      /* optional */
    }
  }, [state.watchlist]);

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  function patchAccount(id: string, patch: Partial<FinanceAccount>) {
    setState((s) => ({
      ...s,
      accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }

  function removeAccount(id: string) {
    setState((s) => ({
      ...s,
      accounts: s.accounts.filter((a) => a.id !== id),
    }));
  }

  function addAccount() {
    setState((s) => ({
      ...s,
      accounts: [...s.accounts, newAccount({ name: "New account" })],
    }));
  }

  function patchBudget(category: string, planned: number) {
    setState((s) => {
      const exists = s.budget.some((b) => b.category === category);
      return {
        ...s,
        budget: exists
          ? s.budget.map((b) =>
              b.category === category ? { ...b, planned } : b
            )
          : [...s.budget, { category, planned }],
      };
    });
  }

  function addTx() {
    if (!txDraft.amount || txDraft.amount <= 0) return;
    const tx: FinanceTx = {
      ...txDraft,
      id: newTx().id,
      amount: Math.abs(txDraft.amount),
      note: txDraft.note.trim(),
      merchant: txDraft.merchant || txDraft.note.trim() || "Manual",
      source: "manual",
    };
    setState((s) => ({ ...s, txs: [tx, ...s.txs] }));
    setTxDraft(newTx({ kind: txDraft.kind, category: txDraft.category }));
    setShowTxForm(false);
  }

  /** One-tap expense — for people who hate forms */
  function quickAdd(q: (typeof QUICK_ADDS)[number]) {
    const tx = newTx({
      kind: "expense",
      amount: q.amount,
      category: q.category,
      note: q.note,
      merchant: q.note,
      source: "manual",
    });
    setState((s) => ({ ...s, txs: [tx, ...s.txs] }));
    setImportNote(`Added ${q.label}`);
    setTab("ledger");
  }

  /** Load sample month so the desk never feels empty */
  function loadDemo() {
    const seed = demoSeedTxs();
    setState((s) => {
      const merged = mergeTxs(s.txs, seed);
      const accounts = s.accounts.map((a) =>
        a.kind === "checking" ? { ...a, balance: Math.max(a.balance, 2400) } : a
      );
      const goals =
        s.goals && s.goals.length
          ? s.goals
          : [
              newGoal({ name: "Emergency fund", target: 5000, saved: 1200 }),
              newGoal({ name: "Clinic seed", target: 10000, saved: 800 }),
            ];
      return { ...s, txs: merged.txs, accounts, goals };
    });
    setImportNote("Demo month loaded — edit or delete anything.");
    setTab("insights");
  }

  function addGoal() {
    if (!goalDraft.name.trim() || goalDraft.target <= 0) return;
    setState((s) => ({
      ...s,
      goals: [...(s.goals || []), { ...goalDraft, id: newGoal().id }],
    }));
    setGoalDraft(newGoal({ name: "", target: 1000, saved: 0 }));
  }

  function patchGoal(
    id: string,
    patch: Partial<{ name: string; target: number; saved: number }>
  ) {
    setState((s) => ({
      ...s,
      goals: (s.goals || []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  }

  function removeGoal(id: string) {
    setState((s) => ({
      ...s,
      goals: (s.goals || []).filter((g) => g.id !== id),
    }));
  }

  function removeTx(id: string) {
    setState((s) => ({ ...s, txs: s.txs.filter((t) => t.id !== id) }));
  }

  function patchTx(id: string, patch: Partial<FinanceTx>) {
    setState((s) => ({
      ...s,
      txs: s.txs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function onCsvFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const existing = fingerprintsFromTxs(state.txs);
      const result = parseBankCsv(text, {
        existingFingerprints: existing,
        accountId: state.accounts[0]?.id || null,
      });
      if (result.errors.length && !result.added.length) {
        setImportNote(result.errors.join(" · "));
        return;
      }
      setState((s) => {
        const merged = mergeTxs(s.txs, result.added);
        return { ...s, txs: merged.txs };
      });
      setImportNote(
        `Imported ${result.added.length} new · skipped ${result.skipped} duplicates` +
          (result.errors.length ? ` · ${result.errors.length} row warnings` : "")
      );
      setTab("ledger");
    };
    reader.readAsText(file);
  }

  function downloadCsv() {
    const csv = exportLedgerCsv(state.txs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wonder-finance-${monthKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function plaidSandboxConnect() {
    setPlaidBusy(true);
    setPlaidNote("Connecting sandbox bank…");
    try {
      // Dev shortcut: sandbox public token without Link UI
      const tokRes = await fetch("/api/finance/plaid/sandbox-public-token", {
        method: "POST",
      });
      const tok = (await tokRes.json()) as {
        public_token?: string;
        error?: string;
      };
      if (!tok.public_token) throw new Error(tok.error || "No sandbox token");

      const exRes = await fetch("/api/finance/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: tok.public_token }),
      });
      const ex = (await exRes.json()) as {
        item_id?: string;
        institutionName?: string;
        error?: string;
      };
      if (!ex.item_id) throw new Error(ex.error || "Exchange failed");

      await plaidSync(ex.item_id, ex.institutionName || "Sandbox Bank");
    } catch (e) {
      setPlaidNote(e instanceof Error ? e.message : "Plaid sandbox failed");
    } finally {
      setPlaidBusy(false);
    }
  }

  async function plaidSync(itemId?: string, institutionName?: string) {
    setPlaidBusy(true);
    setPlaidNote("Syncing accounts + transactions…");
    try {
      const res = await fetch("/api/finance/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId || state.plaidMeta?.itemId,
          institutionName:
            institutionName || state.plaidMeta?.institutionName,
        }),
      });
      const data = (await res.json()) as {
        accounts?: Array<{
          plaidAccountId: string;
          name: string;
          mask?: string | null;
          kind: AccountKind;
          balance: number;
          institution?: string;
        }>;
        transactions?: Array<{
          externalId: string;
          date: string;
          kind: TxKind;
          amount: number;
          merchant: string;
          note: string;
          category: string;
          accountId: string;
          pending?: boolean;
          source: "plaid";
        }>;
        error?: string;
        item_id?: string;
      };
      if (!res.ok) throw new Error(data.error || "Sync failed");

      setState((s) => {
        // Merge accounts by plaid id
        let accounts = [...s.accounts];
        for (const pa of data.accounts || []) {
          const idx = accounts.findIndex(
            (a) => a.plaidAccountId === pa.plaidAccountId
          );
          const row: FinanceAccount = {
            id:
              idx >= 0
                ? accounts[idx].id
                : `acc-plaid-${pa.plaidAccountId.slice(0, 8)}`,
            name: pa.name,
            kind: pa.kind,
            balance: pa.balance,
            institution: pa.institution || institutionName || "Bank",
            plaidAccountId: pa.plaidAccountId,
            mask: pa.mask || null,
            lastSyncAt: new Date().toISOString(),
          };
          if (idx >= 0) accounts[idx] = row;
          else accounts.push(row);
        }

        const incoming: FinanceTx[] = (data.transactions || []).map((t) => {
          // Map plaid account_id → our account id
          const acc =
            accounts.find((a) => a.plaidAccountId === t.accountId) || null;
          return newTx({
            date: t.date,
            kind: t.kind,
            amount: t.amount,
            category: t.category || "Uncategorized",
            note: t.note || t.merchant,
            merchant: t.merchant,
            accountId: acc?.id || null,
            source: "plaid",
            externalId: t.externalId,
            pending: t.pending,
          });
        });
        const merged = mergeTxs(s.txs, incoming);
        return {
          ...s,
          accounts,
          txs: merged.txs,
          plaidMeta: {
            itemId: data.item_id || itemId || s.plaidMeta?.itemId,
            institutionName:
              institutionName ||
              s.plaidMeta?.institutionName ||
              "Bank",
            linkedAt: new Date().toISOString(),
          },
        };
      });
      setPlaidNote(
        `Synced ${(data.accounts || []).length} accounts · ${(data.transactions || []).length} transactions pulled (dupes skipped).`
      );
      setTab("ledger");
    } catch (e) {
      setPlaidNote(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setPlaidBusy(false);
    }
  }

  return (
    <div className="fin">
      {/* Workbook title */}
      <header className="fin-head">
        <h1>Finances.xlsx</h1>
        <p>
          Local workbook · CSV import · optional Plaid · educational credit
          model
        </p>
      </header>

      {/* Ribbon */}
      <div className="fin-links" role="toolbar" aria-label="Finance commands">
        <button
          type="button"
          className="fin-btn fin-btn-primary"
          onClick={() => setShowTxForm((v) => !v)}
        >
          {showTxForm ? "Cancel" : "Insert row"}
        </button>
        <button
          type="button"
          className="fin-btn"
          onClick={() => fileRef.current?.click()}
        >
          Import CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => onCsvFile(e.target.files?.[0] || null)}
        />
        <button type="button" className="fin-btn" onClick={downloadCsv}>
          Export CSV
        </button>
        {state.txs.length === 0 ? (
          <button type="button" className="fin-btn" onClick={loadDemo}>
            Sample data
          </button>
        ) : null}
        {onGo ? (
          <button
            type="button"
            className="fin-btn"
            onClick={() => onGo("pg-world-monitor")}
          >
            Markets
          </button>
        ) : null}
      </div>

      <div className="fin-quick" aria-label="Quick add">
        <span className="fin-quick-label">Quick</span>
        {QUICK_ADDS.map((q) => (
          <button
            key={q.label}
            type="button"
            className="fin-chip"
            onClick={() => quickAdd(q)}
          >
            {q.label}
          </button>
        ))}
      </div>
      {importNote ? <p className="fin-note">{importNote}</p> : null}

      {/* Snapshot */}
      <div className="fin-snap">
        <div className="fin-card">
          <span>Net worth</span>
          <strong className={worth < 0 ? "is-neg" : ""}>{money(worth)}</strong>
        </div>
        <div className="fin-card">
          <span>Cash</span>
          <strong>{money(cash)}</strong>
        </div>
        <div className="fin-card">
          <span>Credit owed</span>
          <strong className={debt > 0 ? "is-neg" : ""}>{money(debt)}</strong>
        </div>
        <div className="fin-card">
          <span>Invested</span>
          <strong>{money(inv)}</strong>
        </div>
        <div className="fin-card">
          <span>Month in</span>
          <strong className="is-pos">{money(income)}</strong>
        </div>
        <div className="fin-card">
          <span>Month out</span>
          <strong className="is-neg">{money(expense)}</strong>
        </div>
        <div className="fin-card">
          <span>Cash flow</span>
          <strong className={cashFlow < 0 ? "is-neg" : "is-pos"}>
            {money(cashFlow)}
          </strong>
        </div>
        <div className="fin-card">
          <span>Savings rate</span>
          <strong className={rate != null && rate < 0 ? "is-neg" : "is-pos"}>
            {rate == null ? "—" : `${rate}%`}
          </strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="fin-tabs" role="tablist">
        {(
          [
            ["insights", "Insights"],
            ["ledger", "Sheet"],
            ["credit", "Credit"],
            ["budget", "Budget"],
            ["goals", "Goals"],
            ["accounts", "Accounts"],
            ["connect", "Bank"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`fin-tab${tab === id ? " is-on" : ""}`}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── INSIGHTS ── */}
      {tab === "insights" ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>Money at a glance · {ym}</h2>
            <p>Where it went · how the last 6 months look</p>
          </div>

          {state.txs.length === 0 ? (
            <div className="fin-empty-box">
              <p className="fin-empty">
                Empty desk. Import a bank CSV, tap <strong>Quick add</strong>, or
                load a demo month to see the full engine.
              </p>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={loadDemo}
              >
                Load demo month
              </button>
            </div>
          ) : (
            <>
              <div className="fin-insight-grid">
                <div className="fin-insight-block">
                  <h3>Spend by category</h3>
                  {catSpend.length === 0 ? (
                    <p className="fin-empty">No expenses this month.</p>
                  ) : (
                    catSpend.map((row) => (
                      <div key={row.cat} className="fin-bar-row">
                        <span title={row.cat}>{row.cat}</span>
                        <div className="fin-bar-track" aria-hidden>
                          <div
                            className="fin-bar-fill"
                            style={{ width: `${row.pct}%` }}
                          />
                        </div>
                        <em>{money(row.total)}</em>
                      </div>
                    ))
                  )}
                </div>

                <div className="fin-insight-block">
                  <h3>6-month cash flow</h3>
                  <div className="fin-spark" role="img" aria-label="Monthly cash flow">
                    {series.map((s) => {
                      const max = Math.max(
                        1,
                        ...series.map((x) => Math.max(x.income, x.expense))
                      );
                      const hIn = Math.round((s.income / max) * 72);
                      const hOut = Math.round((s.expense / max) * 72);
                      return (
                        <div key={s.ym} className="fin-spark-col" title={`${s.ym}: in ${money(s.income)} out ${money(s.expense)}`}>
                          <div className="fin-spark-bars">
                            <i className="is-in" style={{ height: hIn }} />
                            <i className="is-out" style={{ height: hOut }} />
                          </div>
                          <span>{s.ym.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="fin-legend">
                    <span className="is-pos">■ income</span>
                    <span className="is-neg">■ spend</span>
                  </p>
                </div>
              </div>

              {merchants.length > 0 ? (
                <>
                  <div className="fin-sec-head" style={{ marginTop: 20 }}>
                    <h2>Top merchants</h2>
                    <p>This month</p>
                  </div>
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Merchant</th>
                        <th className="num">Times</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {merchants.slice(0, 6).map((m) => (
                        <tr key={m.merchant}>
                          <td>{m.merchant}</td>
                          <td className="num">{m.count}</td>
                          <td className="num">{moneyExact(m.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}

              {goals.length > 0 ? (
                <>
                  <div className="fin-sec-head" style={{ marginTop: 20 }}>
                    <h2>Goals pulse</h2>
                    <p>
                      <button
                        type="button"
                        className="fin-ghost"
                        onClick={() => setTab("goals")}
                      >
                        Manage →
                      </button>
                    </p>
                  </div>
                  {goals.map((g) => {
                    const pct =
                      g.target > 0
                        ? Math.min(100, Math.round((g.saved / g.target) * 100))
                        : 0;
                    return (
                      <div key={g.id} className="fin-bar-row">
                        <span>{g.name}</span>
                        <div className="fin-bar-track" aria-hidden>
                          <div
                            className="fin-bar-fill is-goal"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <em>
                          {money(g.saved)} / {money(g.target)}
                        </em>
                      </div>
                    );
                  })}
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {showTxForm ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>Manual transaction</h2>
            <p>For cash / anything not in a CSV yet</p>
          </div>
          <div className="fin-form">
            <label>
              Type
              <select
                value={txDraft.kind}
                onChange={(e) =>
                  setTxDraft((d) => ({
                    ...d,
                    kind: e.target.value as TxKind,
                  }))
                }
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
            <label>
              Amount
              <input
                type="number"
                min={0}
                step="0.01"
                value={txDraft.amount || ""}
                onChange={(e) =>
                  setTxDraft((d) => ({
                    ...d,
                    amount: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={txDraft.date}
                onChange={(e) =>
                  setTxDraft((d) => ({ ...d, date: e.target.value }))
                }
              />
            </label>
            <label>
              Category
              <select
                value={txDraft.category}
                onChange={(e) =>
                  setTxDraft((d) => ({ ...d, category: e.target.value }))
                }
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="fin-wide">
              Merchant / note
              <input
                type="text"
                value={txDraft.note}
                placeholder="Who / what"
                onChange={(e) =>
                  setTxDraft((d) => ({
                    ...d,
                    note: e.target.value,
                    merchant: e.target.value,
                  }))
                }
              />
            </label>
            <button
              type="button"
              className="fin-btn fin-btn-primary"
              onClick={addTx}
            >
              Save
            </button>
          </div>
        </section>
      ) : null}

      {/* ── LEDGER ── */}
      {tab === "ledger" ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>Sheet1 · Ledger</h2>
            <p>
              Click cells · paste from Excel · sort headers · =SUM in footer
            </p>
          </div>

          <div className="fin-filters">
            <input
              type="search"
              placeholder="Search merchant, note, category…"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              aria-label="Search transactions"
            />
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              aria-label="Month"
            >
              <option value="all">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={filterKind}
              onChange={(e) =>
                setFilterKind(e.target.value as "all" | TxKind)
              }
              aria-label="Type"
            >
              <option value="all">All types</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              aria-label="Category"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="button" className="fin-btn" onClick={addBlankSheetRow}>
              + Row
            </button>
          </div>

          <p className="fin-sheet-hint">
            Paste from Google Sheets: Date · Merchant · Amount · Category
            (columns). Negative amounts = expense.
          </p>

          <div
            className="fin-table-scroll fin-sheet"
            onPaste={onLedgerPaste}
            tabIndex={0}
          >
            <table className="fin-table fin-sheet-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="fin-th-btn" onClick={() => toggleSort("date")}>
                      Date {sortKey === "date" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="fin-th-btn" onClick={() => toggleSort("merchant")}>
                      Merchant {sortKey === "merchant" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="fin-th-btn" onClick={() => toggleSort("category")}>
                      Category {sortKey === "category" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="fin-th-btn" onClick={() => toggleSort("kind")}>
                      Type {sortKey === "kind" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="num">
                    <button type="button" className="fin-th-btn" onClick={() => toggleSort("amount")}>
                      Amount {sortKey === "amount" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="fin-empty">
                      Empty sheet. Import bank CSV, paste rows, or + Row.
                    </td>
                  </tr>
                ) : (
                  ledger.slice(0, 800).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <input
                          type="date"
                          className="fin-cell"
                          value={t.date}
                          onChange={(e) =>
                            patchTx(t.id, { date: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="fin-cell"
                          value={t.merchant || t.note || ""}
                          placeholder="Who / what"
                          onChange={(e) =>
                            patchTx(t.id, {
                              merchant: e.target.value,
                              note: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="fin-cell"
                          value={t.category}
                          onChange={(e) =>
                            patchTx(t.id, { category: e.target.value })
                          }
                        >
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="fin-cell"
                          value={t.kind}
                          onChange={(e) =>
                            patchTx(t.id, {
                              kind: e.target.value as TxKind,
                            })
                          }
                        >
                          <option value="expense">Out</option>
                          <option value="income">In</option>
                        </select>
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          className={`fin-cell fin-cell-num${
                            t.kind === "income" ? " is-pos" : " is-neg"
                          }`}
                          min={0}
                          step="0.01"
                          value={t.amount || ""}
                          onChange={(e) =>
                            patchTx(t.id, {
                              amount: Math.max(
                                0,
                                Number(e.target.value) || 0
                              ),
                            })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="fin-ghost"
                          onClick={() => removeTx(t.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="fin-sheet-sum">
                  <td colSpan={4}>
                    =SUM · {ledgerTotals.count} rows visible
                  </td>
                  <td className="num">
                    <span className="is-pos">+{moneyExact(ledgerTotals.income)}</span>
                    <br />
                    <span className="is-neg">−{moneyExact(ledgerTotals.expense)}</span>
                    <br />
                    <strong className={ledgerTotals.net < 0 ? "is-neg" : "is-pos"}>
                      net {moneyExact(ledgerTotals.net)}
                    </strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {/* ── CREDIT HEALTH ── */}
      {tab === "credit" ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>Credit health</h2>
            <p>Honest estimate + a plan to climb — not a bureau hard pull</p>
          </div>

          <div className="fin-credit-hero">
            <div className="fin-credit-score">
              <span>Health estimate</span>
              <strong>{creditReport.estimate}</strong>
              <em>{creditReport.band}</em>
            </div>
            <div className="fin-credit-util">
              <span>Card utilization</span>
              <strong>
                {creditReport.utilization == null
                  ? "Add limits"
                  : `${Math.round(creditReport.utilization * 100)}%`}
              </strong>
              <em>
                Goal: under 30% always · under 10% for excellent range
              </em>
            </div>
          </div>

          <p className="fin-note fin-credit-disclaimer">
            {creditReport.disclaimer}
          </p>

          <div className="fin-sec-head" style={{ marginTop: 18 }}>
            <h2>What’s driving this</h2>
          </div>
          {creditReport.factors.map((f) => (
            <div key={f.id} className="fin-bar-row">
              <span title={f.label}>
                {f.label} · {f.weight}%
              </span>
              <div className="fin-bar-track" aria-hidden>
                <div
                  className={`fin-bar-fill${
                    f.status === "bad"
                      ? " is-over"
                      : f.status === "good"
                        ? " is-goal"
                        : ""
                  }`}
                  style={{ width: `${f.score}%` }}
                />
              </div>
              <em>{f.score}</em>
            </div>
          ))}
          <ul className="fin-factor-notes">
            {creditReport.factors.map((f) => (
              <li key={`${f.id}-d`}>
                <strong>{f.label}:</strong> {f.detail}
              </li>
            ))}
          </ul>

          <div className="fin-sec-head" style={{ marginTop: 22 }}>
            <h2>Your fix plan</h2>
            <p>Do these in order — score follows behavior</p>
          </div>
          <div className="fin-tips">
            {creditReport.tips.map((tip, i) => (
              <article key={i} className={`fin-tip fin-tip-${tip.priority}`}>
                <header>
                  <span className="fin-tip-when">
                    {tip.priority === "now"
                      ? "Do now"
                      : tip.priority === "this_month"
                        ? "This month"
                        : "This year"}
                  </span>
                  <h3>{tip.title}</h3>
                </header>
                <p>
                  <strong>Why:</strong> {tip.why}
                </p>
                <p>
                  <strong>How:</strong> {tip.how}
                </p>
              </article>
            ))}
          </div>

          <div className="fin-sec-head" style={{ marginTop: 24 }}>
            <h2>Tell the model your situation</h2>
            <p>Honest answers = better tips (stays on this device)</p>
          </div>
          <div className="fin-form fin-credit-form">
            <label>
              On-time payments %
              <input
                type="number"
                min={0}
                max={100}
                value={creditProfile.onTimePct}
                onChange={(e) =>
                  patchCreditProfile({
                    onTimePct: Math.min(
                      100,
                      Math.max(0, Number(e.target.value) || 0)
                    ),
                  })
                }
              />
            </label>
            <label>
              Years of credit history
              <input
                type="number"
                min={0}
                step="0.5"
                value={creditProfile.historyYears}
                onChange={(e) =>
                  patchCreditProfile({
                    historyYears: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label>
              Hard inquiries (12 mo)
              <input
                type="number"
                min={0}
                value={creditProfile.hardInquiries}
                onChange={(e) =>
                  patchCreditProfile({
                    hardInquiries: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label>
              Open accounts
              <input
                type="number"
                min={0}
                value={creditProfile.openAccounts}
                onChange={(e) =>
                  patchCreditProfile({
                    openAccounts: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label>
              Lates in last 2 years
              <input
                type="number"
                min={0}
                value={creditProfile.recentLates}
                onChange={(e) =>
                  patchCreditProfile({
                    recentLates: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label>
              Open collections
              <input
                type="number"
                min={0}
                value={creditProfile.collections}
                onChange={(e) =>
                  patchCreditProfile({
                    collections: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label>
              Known real score (optional)
              <input
                type="number"
                min={300}
                max={850}
                placeholder="e.g. 620"
                value={creditProfile.knownScore ?? ""}
                onChange={(e) =>
                  patchCreditProfile({
                    knownScore: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </label>
          </div>

          <div className="fin-sec-head" style={{ marginTop: 22 }}>
            <h2>Cards feeding utilization</h2>
            <p>Balance + limit on each credit account → auto % above</p>
          </div>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Card</th>
                <th className="num">Balance owed</th>
                <th className="num">Limit</th>
                <th className="num">Used %</th>
              </tr>
            </thead>
            <tbody>
              {state.accounts
                .filter((a) => a.kind === "credit")
                .map((a) => {
                  const lim = a.creditLimit || 0;
                  const pct =
                    lim > 0
                      ? Math.round((Math.max(0, a.balance) / lim) * 100)
                      : null;
                  return (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td className="num">
                        <input
                          type="number"
                          value={a.balance}
                          onChange={(e) =>
                            patchAccount(a.id, {
                              balance: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          placeholder="limit"
                          value={a.creditLimit ?? ""}
                          onChange={(e) =>
                            patchAccount(a.id, {
                              creditLimit: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                        />
                      </td>
                      <td className="num">
                        {pct == null ? "—" : `${pct}%`}
                      </td>
                    </tr>
                  );
                })}
              {state.accounts.filter((a) => a.kind === "credit").length ===
              0 ? (
                <tr>
                  <td colSpan={4} className="fin-empty">
                    Add a credit account on Accounts tab, set Type = Credit.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ── BUDGET ── */}
      {tab === "budget" ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>Budget · {ym}</h2>
            <p>
              In {money(income)} · Out {money(expense)}
            </p>
          </div>
          <div className="fin-filters">
            <select
              value={filterMonth === "all" ? monthKey() : filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          {state.budget.map((b) => {
            const spent = spentMap[b.category] || 0;
            const planned = b.planned || 0;
            const pct =
              planned > 0
                ? Math.min(100, Math.round((spent / planned) * 100))
                : spent > 0
                  ? 100
                  : 0;
            const over = planned > 0 && spent > planned;
            return (
              <div key={b.category} className="fin-bar-row">
                <span title={b.category}>{b.category}</span>
                <div className="fin-bar-track" aria-hidden>
                  <div
                    className={`fin-bar-fill${over ? " is-over" : ""}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <em>
                  {money(spent)}
                  {planned > 0 ? ` / ${money(planned)}` : ""}
                </em>
              </div>
            );
          })}
          <table className="fin-table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Planned / mo</th>
              </tr>
            </thead>
            <tbody>
              {state.budget.map((b) => (
                <tr key={`plan-${b.category}`}>
                  <td>{b.category}</td>
                  <td className="num">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={b.planned || ""}
                      onChange={(e) =>
                        patchBudget(
                          b.category,
                          Math.max(0, Number(e.target.value) || 0)
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ── GOALS ── */}
      {tab === "goals" ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>Savings goals</h2>
            <p>Name a target · track what you’ve put aside</p>
          </div>

          {goals.length === 0 ? (
            <p className="fin-empty">
              No goals yet. Add one below (emergency fund, clinic seed, trip…).
            </p>
          ) : (
            goals.map((g) => {
              const pct =
                g.target > 0
                  ? Math.min(100, Math.round((g.saved / g.target) * 100))
                  : 0;
              return (
                <div key={g.id} className="fin-goal-card">
                  <div className="fin-goal-top">
                    <input
                      className="fin-goal-name"
                      value={g.name}
                      onChange={(e) => patchGoal(g.id, { name: e.target.value })}
                      aria-label="Goal name"
                    />
                    <button
                      type="button"
                      className="fin-ghost"
                      onClick={() => removeGoal(g.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="fin-bar-track fin-goal-track" aria-hidden>
                    <div
                      className="fin-bar-fill is-goal"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="fin-goal-nums">
                    <label>
                      Saved
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={g.saved || ""}
                        onChange={(e) =>
                          patchGoal(g.id, {
                            saved: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                    </label>
                    <label>
                      Target
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={g.target || ""}
                        onChange={(e) =>
                          patchGoal(g.id, {
                            target: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                    </label>
                    <em>{pct}%</em>
                  </div>
                </div>
              );
            })
          )}

          <div className="fin-sec-head" style={{ marginTop: 22 }}>
            <h2>Add goal</h2>
          </div>
          <div className="fin-form">
            <label>
              Name
              <input
                type="text"
                value={goalDraft.name}
                placeholder="Emergency fund"
                onChange={(e) =>
                  setGoalDraft((d) => ({ ...d, name: e.target.value }))
                }
              />
            </label>
            <label>
              Target $
              <input
                type="number"
                min={0}
                value={goalDraft.target || ""}
                onChange={(e) =>
                  setGoalDraft((d) => ({
                    ...d,
                    target: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </label>
            <label>
              Already saved $
              <input
                type="number"
                min={0}
                value={goalDraft.saved || ""}
                onChange={(e) =>
                  setGoalDraft((d) => ({
                    ...d,
                    saved: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </label>
            <button
              type="button"
              className="fin-btn fin-btn-primary"
              onClick={addGoal}
            >
              Save goal
            </button>
          </div>
        </section>
      ) : null}

      {/* ── ACCOUNTS ── */}
      {tab === "accounts" ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>Accounts</h2>
            <p>
              Attach banks via Bank tab · for cards set Limit so credit health
              auto-calculates utilization
            </p>
          </div>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Bank</th>
                <th className="num">Balance</th>
                <th className="num">Limit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input
                      value={a.name}
                      onChange={(e) =>
                        patchAccount(a.id, { name: e.target.value })
                      }
                    />
                    {a.mask ? (
                      <span className="fin-mask">··{a.mask}</span>
                    ) : null}
                  </td>
                  <td>
                    <select
                      value={a.kind}
                      onChange={(e) =>
                        patchAccount(a.id, {
                          kind: e.target.value as AccountKind,
                        })
                      }
                    >
                      {KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={a.institution || ""}
                      placeholder="—"
                      onChange={(e) =>
                        patchAccount(a.id, { institution: e.target.value })
                      }
                    />
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      step="1"
                      value={a.balance}
                      onChange={(e) =>
                        patchAccount(a.id, {
                          balance: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </td>
                  <td className="num">
                    {a.kind === "credit" ? (
                      <input
                        type="number"
                        step="1"
                        placeholder="limit"
                        value={a.creditLimit ?? ""}
                        onChange={(e) =>
                          patchAccount(a.id, {
                            creditLimit: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="fin-ghost"
                      onClick={() => removeAccount(a.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fin-links" style={{ marginTop: 10 }}>
            <button type="button" className="fin-btn" onClick={addAccount}>
              Add account
            </button>
          </div>

          <div className="fin-sec-head" style={{ marginTop: 28 }}>
            <h2>Watchlist</h2>
            <p>Markets strip</p>
          </div>
          <div className="fin-watch">
            {state.watchlist.map((sym) => {
              const q = quotes.find(
                (x) => x.symbol?.toUpperCase() === sym.toUpperCase()
              );
              const pct = q?.changePct;
              return (
                <div key={sym} className="fin-quote">
                  <b>{sym}</b>
                  <strong>
                    {q?.price != null ? moneyExact(q.price) : "—"}
                  </strong>
                  {pct != null ? (
                    <small className={pct >= 0 ? "up" : "down"}>
                      {pct >= 0 ? "+" : ""}
                      {pct.toFixed(2)}%
                    </small>
                  ) : (
                    <small>—</small>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── BANK CONNECT ── */}
      {tab === "connect" ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>Attach bank accounts</h2>
            <p>
              Automatic when Plaid keys are set · otherwise export CSV from
              your bank app and import (works today, zero setup)
            </p>
          </div>

          <div className="fin-auto-steps">
            <div>
              <b>1 · Fast path (no keys)</b>
              <p>
                Chase / Amex / Capital One app → Statements or Download → CSV →
                Import bank CSV above. Duplicates auto-skip.
              </p>
            </div>
            <div>
              <b>2 · Automatic path (Plaid)</b>
              <p>
                Free Plaid developer account → put PLAID_CLIENT_ID +
                PLAID_SECRET in Wonder .env → restart → Connect sandbox / live
                bank. Sync pulls accounts + transactions.
              </p>
            </div>
            <div>
              <b>3 · Credit climb</b>
              <p>
                After balances land, set each card’s Limit on Accounts → open
                Credit tab for score estimate + fix plan.
              </p>
            </div>
          </div>

          <div className="fin-connect-grid">
            <article className="fin-connect-card">
              <h3>1 · CSV (works now)</h3>
              <p>
                Download a CSV from Chase, Amex, Capital One, etc. Import
                above. We auto-categorize and skip duplicates. No bank login
                shared with us.
              </p>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => fileRef.current?.click()}
              >
                Import bank CSV
              </button>
            </article>

            <article className="fin-connect-card">
              <h3>2 · Plaid (auto-sync)</h3>
              <p>
                Same engine Mintable uses. Free Plaid developer keys → Wonder
                can pull balances + ~90 days of transactions.
              </p>
              <p className="fin-note">
                Status:{" "}
                {plaid?.ready
                  ? `Ready (${plaid.env || "sandbox"})`
                  : "Not configured"}
                {plaid?.message ? ` — ${plaid.message}` : ""}
              </p>
              {plaid?.setupUrl ? (
                <p className="fin-note">
                  Keys:{" "}
                  <a href={plaid.setupUrl} target="_blank" rel="noreferrer">
                    Plaid dashboard
                  </a>
                  . Set{" "}
                  <code>PLAID_CLIENT_ID</code> + <code>PLAID_SECRET</code> (+
                  optional <code>PLAID_ENV=sandbox</code>) then restart Vite.
                </p>
              ) : null}
              <div className="fin-links">
                <button
                  type="button"
                  className="fin-btn fin-btn-primary"
                  disabled={!plaid?.ready || plaidBusy}
                  onClick={() => void plaidSandboxConnect()}
                >
                  {plaidBusy
                    ? "Working…"
                    : "Connect sandbox bank (test)"}
                </button>
                <button
                  type="button"
                  className="fin-btn"
                  disabled={!plaid?.ready || plaidBusy || !state.plaidMeta?.itemId}
                  onClick={() => void plaidSync()}
                >
                  Sync linked bank
                </button>
              </div>
              {state.plaidMeta?.institutionName ? (
                <p className="fin-note">
                  Linked: {state.plaidMeta.institutionName}
                  {state.plaidMeta.linkedAt
                    ? ` · ${new Date(state.plaidMeta.linkedAt).toLocaleString()}`
                    : ""}
                </p>
              ) : null}
              {plaidNote ? <p className="fin-note">{plaidNote}</p> : null}
            </article>
          </div>

          <p className="fin-note" style={{ marginTop: 16 }}>
            Live Link UI (pick your real bank in a Plaid popup) can be added
            once keys are on this machine — sandbox proves the full pull works
            first. Never paste bank passwords into Wonder.
          </p>
        </section>
      ) : null}
    </div>
  );
}
