/**
 * Wonder Finances — Mintable-style full money tracker.
 * - Manual + CSV bank statements (works offline, no ads)
 * - Optional Plaid bank link when PLAID_* keys are set
 * - Every transaction searchable; auto-category; budgets; export
 * Not financial advice.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./finance.css";
import { FINANCE_CATEGORIES } from "./financeCategorize";
import { exportLedgerCsv, parseBankCsv } from "./financeCsv";
import {
  cashOnHand,
  creditOwed,
  fingerprintsFromTxs,
  invested,
  loadFinance,
  mergeTxs,
  money,
  moneyExact,
  monthExpense,
  monthIncome,
  monthKey,
  netWorth,
  newAccount,
  newTx,
  recentMonthKeys,
  saveFinance,
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

type TabId = "ledger" | "budget" | "accounts" | "connect";

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
  const [tab, setTab] = useState<TabId>("ledger");
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
  const fileRef = useRef<HTMLInputElement>(null);

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

  const categories = useMemo(() => {
    const set = new Set<string>([
      ...FINANCE_CATEGORIES,
      ...state.budget.map((b) => b.category),
      ...state.txs.map((t) => t.category),
    ]);
    return Array.from(set);
  }, [state.budget, state.txs]);

  // Full filtered ledger (everything trackable)
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
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return list;
  }, [state.txs, filterMonth, filterKind, filterCat, filterQ]);

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
      <header className="fin-head">
        <h1>Finances</h1>
        <p>
          Track every dollar — like{" "}
          <a
            href="https://github.com/kevinschaich/mintable"
            target="_blank"
            rel="noreferrer"
          >
            Mintable
          </a>
          : bank CSV import, optional Plaid bank link, full ledger, budgets.
          Data stays on this device unless you connect Plaid.
        </p>
        <div className="fin-links">
          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={() => setShowTxForm((v) => !v)}
          >
            {showTxForm ? "Close" : "Add transaction"}
          </button>
          <button
            type="button"
            className="fin-btn"
            onClick={() => fileRef.current?.click()}
          >
            Import bank CSV
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
          {onGo ? (
            <button
              type="button"
              className="fin-btn"
              onClick={() => onGo("pg-world-monitor")}
            >
              Markets desk
            </button>
          ) : null}
        </div>
        {importNote ? <p className="fin-note">{importNote}</p> : null}
      </header>

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
          <span>Transactions</span>
          <strong>{state.txs.length.toLocaleString()}</strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="fin-tabs" role="tablist">
        {(
          [
            ["ledger", "Ledger"],
            ["budget", "Budget"],
            ["accounts", "Accounts"],
            ["connect", "Bank connect"],
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
            <h2>Every transaction</h2>
            <p>
              Showing {ledger.length.toLocaleString()} · filter anything
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
          </div>

          {ledger.length === 0 ? (
            <p className="fin-empty">
              Nothing here yet. Import a bank CSV or add a transaction.
            </p>
          ) : (
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Merchant</th>
                    <th>Category</th>
                    <th>Source</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 500).map((t) => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td>
                        <div className="fin-merchant">
                          {t.merchant || t.note || "—"}
                          {t.pending ? (
                            <em className="fin-pending">pending</em>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <select
                          className="fin-cat-select"
                          value={t.category}
                          onChange={(e) =>
                            patchTx(t.id, { category: e.target.value })
                          }
                          aria-label="Category"
                        >
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="fin-src">{t.source || "manual"}</td>
                      <td className="num">
                        <span
                          className={
                            t.kind === "income" ? "is-pos" : "is-neg"
                          }
                        >
                          {t.kind === "income" ? "+" : "−"}
                          {moneyExact(t.amount)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="fin-ghost"
                          onClick={() => removeTx(t.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ledger.length > 500 ? (
                <p className="fin-note">
                  Showing first 500 of {ledger.length}. Export CSV for full
                  dump.
                </p>
              ) : null}
            </div>
          )}

          {merchants.length > 0 ? (
            <>
              <div className="fin-sec-head" style={{ marginTop: 28 }}>
                <h2>Top merchants · {ym}</h2>
                <p>Where money goes</p>
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
                  {merchants.map((m) => (
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

      {/* ── ACCOUNTS ── */}
      {tab === "accounts" ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>Accounts</h2>
            <p>Balances · credit = what you owe</p>
          </div>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Bank</th>
                <th className="num">Balance</th>
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
            <h2>Bank connect</h2>
            <p>Mintable path: Plaid free plan · or CSV only</p>
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
