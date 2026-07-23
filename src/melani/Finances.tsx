/**
 * Finances page — personal money desk inside Wonder.
 * Accounts + budget + spending log + light market quotes.
 * Not financial advice. Numbers stay on this device.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import "./finance.css";
import {
  cashOnHand,
  creditOwed,
  loadFinance,
  money,
  moneyExact,
  monthExpense,
  monthIncome,
  monthKey,
  netWorth,
  newAccount,
  newTx,
  saveFinance,
  spentByCategory,
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
  shortName?: string;
};

/** Normalize market API rows (Yahoo uses regularMarket* names) */
function mapQuote(raw: Record<string, unknown>): Quote {
  const symbol = String(raw.symbol || "");
  const price =
    typeof raw.regularMarketPrice === "number"
      ? raw.regularMarketPrice
      : typeof raw.price === "number"
        ? raw.price
        : null;
  const changePct =
    typeof raw.regularMarketChangePercent === "number"
      ? raw.regularMarketChangePercent
      : typeof raw.changePct === "number"
        ? raw.changePct
        : null;
  return {
    symbol,
    price,
    changePct,
    shortName:
      typeof raw.shortName === "string" ? raw.shortName : undefined,
  };
}

const KINDS: { id: AccountKind; label: string }[] = [
  { id: "checking", label: "Checking" },
  { id: "savings", label: "Savings" },
  { id: "cash", label: "Cash" },
  { id: "credit", label: "Credit (owe)" },
  { id: "invest", label: "Invest" },
  { id: "other", label: "Other" },
];

export function Finances({ onGo }: { onGo?: (pageId: string) => void }) {
  const [state, setState] = useState<FinanceState>(() => loadFinance());
  const [showTxForm, setShowTxForm] = useState(false);
  const [txDraft, setTxDraft] = useState(() => newTx());
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteNote, setQuoteNote] = useState("");

  // Persist whenever state changes
  useEffect(() => {
    saveFinance(state);
  }, [state]);

  const ym = monthKey();
  const spentMap = useMemo(
    () => spentByCategory(state.txs, ym),
    [state.txs, ym]
  );
  const income = useMemo(() => monthIncome(state.txs, ym), [state.txs, ym]);
  const expense = useMemo(() => monthExpense(state.txs, ym), [state.txs, ym]);
  const worth = netWorth(state.accounts);
  const cash = cashOnHand(state.accounts);
  const debt = creditOwed(state.accounts);
  const cashFlow = income - expense;

  const categories = useMemo(() => {
    const set = new Set(state.budget.map((b) => b.category));
    state.txs.forEach((t) => set.add(t.category));
    return Array.from(set);
  }, [state.budget, state.txs]);

  const recentTxs = useMemo(
    () =>
      [...state.txs]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 40),
    [state.txs]
  );

  // Live mini quotes (same market API as World Monitor)
  const loadQuotes = useCallback(async () => {
    if (!state.watchlist.length) return;
    setQuoteNote("Loading…");
    try {
      const q = state.watchlist.map((s) => encodeURIComponent(s)).join(",");
      const res = await fetch(`/api/market/quote?symbols=${q}`);
      if (!res.ok) throw new Error(`quote ${res.status}`);
      const data = (await res.json()) as {
        quotes?: Record<string, unknown>[];
      };
      const list = Array.isArray(data.quotes)
        ? data.quotes.map((row) => mapQuote(row))
        : [];
      setQuotes(list);
      setQuoteNote(list.length ? "" : "No quote data returned.");
    } catch {
      setQuoteNote("Quotes unavailable right now — open World Monitor for full desk.");
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
    };
    setState((s) => ({ ...s, txs: [tx, ...s.txs] }));
    setTxDraft(newTx({ kind: txDraft.kind, category: txDraft.category }));
    setShowTxForm(false);
  }

  function removeTx(id: string) {
    setState((s) => ({ ...s, txs: s.txs.filter((t) => t.id !== id) }));
  }

  return (
    <div className="fin">
      <header className="fin-head">
        <h1>Finances</h1>
        <p>
          Your money on this device — accounts, budget, and spending. Markets
          strip is live when the quote API works. Not financial advice.
        </p>
        <div className="fin-links">
          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={() => setShowTxForm((v) => !v)}
          >
            {showTxForm ? "Close form" : "Add transaction"}
          </button>
          {onGo ? (
            <button
              type="button"
              className="fin-btn"
              onClick={() => onGo("pg-world-monitor")}
            >
              World Monitor (stocks)
            </button>
          ) : null}
          <button type="button" className="fin-btn" onClick={() => void loadQuotes()}>
            Refresh quotes
          </button>
        </div>
      </header>

      {/* Snapshot */}
      <div className="fin-snap">
        <div className="fin-card">
          <span>Net worth</span>
          <strong className={worth < 0 ? "is-neg" : ""}>{money(worth)}</strong>
        </div>
        <div className="fin-card">
          <span>Cash on hand</span>
          <strong>{money(cash)}</strong>
        </div>
        <div className="fin-card">
          <span>Credit owed</span>
          <strong className={debt > 0 ? "is-neg" : ""}>{money(debt)}</strong>
        </div>
        <div className="fin-card">
          <span>This month</span>
          <strong className={cashFlow < 0 ? "is-neg" : "is-pos"}>
            {money(cashFlow)}
          </strong>
        </div>
      </div>

      {/* Add transaction */}
      {showTxForm ? (
        <section className="fin-sec">
          <div className="fin-sec-head">
            <h2>New transaction</h2>
            <p>Expense or income · logged for this month’s budget</p>
          </div>
          <div className="fin-form">
            <label>
              Type
              <select
                value={txDraft.kind}
                onChange={(e) =>
                  setTxDraft((d) => ({ ...d, kind: e.target.value as TxKind }))
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
              Note
              <input
                type="text"
                value={txDraft.note}
                placeholder="Optional"
                onChange={(e) =>
                  setTxDraft((d) => ({ ...d, note: e.target.value }))
                }
              />
            </label>
            <button type="button" className="fin-btn fin-btn-primary" onClick={addTx}>
              Save
            </button>
          </div>
        </section>
      ) : null}

      {/* Accounts */}
      <section className="fin-sec">
        <div className="fin-sec-head">
          <h2>Accounts</h2>
          <p>Credit balance = what you owe</p>
        </div>
        <table className="fin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
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
                    aria-label="Account name"
                  />
                </td>
                <td>
                  <select
                    value={a.kind}
                    onChange={(e) =>
                      patchAccount(a.id, {
                        kind: e.target.value as AccountKind,
                      })
                    }
                    aria-label="Account type"
                  >
                    {KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
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
                    aria-label={`${a.name} balance`}
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
      </section>

      {/* Budget */}
      <section className="fin-sec">
        <div className="fin-sec-head">
          <h2>Budget · {ym}</h2>
          <p>
            Income {money(income)} · Spent {money(expense)}
          </p>
        </div>
        {state.budget.map((b) => {
          const spent = spentMap[b.category] || 0;
          const planned = b.planned || 0;
          const pct =
            planned > 0 ? Math.min(100, Math.round((spent / planned) * 100)) : spent > 0 ? 100 : 0;
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
        <table className="fin-table" style={{ marginTop: 14 }}>
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
                    aria-label={`${b.category} planned`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fin-note">
          Set planned amounts. Bars fill from expenses you log this month.
        </p>
      </section>

      {/* Transactions */}
      <section className="fin-sec">
        <div className="fin-sec-head">
          <h2>Recent transactions</h2>
          <p>Newest first</p>
        </div>
        {recentTxs.length === 0 ? (
          <p className="fin-empty">No transactions yet. Add one above.</p>
        ) : (
          <table className="fin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Note</th>
                <th>Category</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recentTxs.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.note || (t.kind === "income" ? "Income" : "Expense")}</td>
                  <td>{t.category}</td>
                  <td className="num">
                    {t.kind === "income" ? "+" : "−"}
                    {moneyExact(t.amount)}
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
        )}
      </section>

      {/* Markets strip */}
      <section className="fin-sec">
        <div className="fin-sec-head">
          <h2>Watchlist</h2>
          <p>{quoteNote || "Live quotes · full desk on World Monitor"}</p>
        </div>
        {quotes.length === 0 && !quoteNote ? (
          <p className="fin-empty">No quotes loaded.</p>
        ) : (
          <div className="fin-watch">
            {state.watchlist.map((sym) => {
              const q =
                quotes.find(
                  (x) => x.symbol?.toUpperCase() === sym.toUpperCase()
                ) || null;
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
        )}
        <p className="fin-note">
          Edit watchlist symbols in browser storage later if you want — default
          is SPY, QQQ, AAPL, NVDA. Deep charts and SEC reports stay on World
          Monitor.
        </p>
      </section>
    </div>
  );
}
