/**
 * Wonder Finances — Rockefeller bookkeeping desk.
 * Ledger first · every dollar named · every cent recorded · period closed.
 * Not financial advice. Credit estimate is educational, not FICO.
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
  answerFromBrief,
  buildSmartBrief,
} from "./financeIntelligence";
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
  moneyCents,
  monthExpense,
  monthIncome,
  monthKey,
  monthlySeries,
  netWorth,
  newAccount,
  newGoal,
  newTx,
  recentMonthKeys,
  runningBalanceMap,
  bookkeeperGaps,
  savingsRate,
  scaleBudget,
  spentByCategory,
  topMerchants,
  autoBudgetFromHistory,
  budgetFromLastMonth,
  type AccountKind,
  type FinanceAccount,
  type FinanceState,
  type FinanceTx,
  type TxKind,
} from "./financeStore";
import {
  hasEncryptedVault,
  isVaultUnlocked,
  lockVault,
  probeVault,
  saveVault,
  setupVault,
  unlockVault,
  wipePlainFinanceKeys,
} from "./financeVault";

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
  | "overview"
  | "transactions"
  | "plan"
  | "goals"
  | "insights"
  | "accounts";

type SortKey = "date" | "merchant" | "category" | "amount" | "kind";

/** Bookkeeper desk — ledger is home, not a marketing dashboard */
const NAV: { id: TabId; label: string; icon: string }[] = [
  { id: "transactions", label: "Ledger", icon: "☰" },
  { id: "overview", label: "Books", icon: "◉" },
  { id: "plan", label: "Plan", icon: "▦" },
  { id: "goals", label: "Goals", icon: "◎" },
  { id: "insights", label: "Review", icon: "◈" },
  { id: "accounts", label: "Accounts", icon: "▭" },
];

/** Rockefeller-style rules — short, quiet, always on the desk */
const BOOKKEEPER_RULES = [
  "Record every dollar the day it moves.",
  "Name every line — no blank payees, no vague categories.",
  "Balance the books before you spend again.",
  "Keep what you can. Waste nothing you track.",
];

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

const PLAN_GROUPS: { id: string; label: string; cats: string[] }[] = [
  {
    id: "essentials",
    label: "Essentials",
    cats: [
      "Rent / housing",
      "Utilities",
      "Food / groceries",
      "Transport",
      "Health",
    ],
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    cats: [
      "Restaurants / coffee",
      "Shopping",
      "Fun",
      "Travel",
      "Subscriptions",
      "Build / tools",
    ],
  },
  {
    id: "goals",
    label: "Goals",
    cats: ["Transfers"],
  },
  {
    id: "buffer",
    label: "Buffer",
    cats: ["Fees", "Other", "Uncategorized"],
  },
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

/** Daily net for current month — green/red chart */
function dailyBars(txs: FinanceTx[], ym: string) {
  const daysInMonth = 28;
  const map = new Map<number, number>();
  for (const t of txs) {
    if (!t.date.startsWith(ym)) continue;
    const d = Number(t.date.slice(8, 10));
    if (!d) continue;
    const signed = t.kind === "income" ? t.amount : -t.amount;
    map.set(d, (map.get(d) || 0) + signed);
  }
  const out: { day: number; net: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    out.push({ day: d, net: map.get(d) || 0 });
  }
  return out;
}

export function Finances({ onGo }: { onGo?: (pageId: string) => void }) {
  /**
   * Vault gate — books never sit as plain JSON once encrypted.
   * setup = create passphrase · unlock = open vault · ready = working
   */
  const [vaultGate, setVaultGate] = useState<"setup" | "unlock" | "ready">(
    () => (probeVault().mode === "encrypted" ? "unlock" : "setup")
  );
  const [vaultPass, setVaultPass] = useState("");
  const [vaultPass2, setVaultPass2] = useState("");
  const [vaultErr, setVaultErr] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const [state, setState] = useState<FinanceState | null>(() =>
    probeVault().mode === "encrypted" ? null : loadFinance()
  );
  // Ledger first — a meticulous bookkeeper opens the daybook, not a dashboard
  const [tab, setTab] = useState<TabId>("transactions");
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
  const [askQ, setAskQ] = useState("");
  const [askA, setAskA] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const idleTimer = useRef<number | null>(null);

  const creditProfile: CreditProfile = useMemo(
    () => ({
      ...DEFAULT_CREDIT_PROFILE,
      ...((state?.creditProfile) || {}),
    }),
    [state?.creditProfile]
  );

  const creditReport = useMemo(
    () =>
      state
        ? buildCreditReport(creditProfile, state.accounts)
        : buildCreditReport(DEFAULT_CREDIT_PROFILE, []),
    [creditProfile, state]
  );

  // Persist only to encrypted vault while unlocked — never write plain books
  useEffect(() => {
    if (!state || vaultGate !== "ready" || !isVaultUnlocked()) return;
    let cancelled = false;
    void saveVault(state)
      .then(() => {
        if (!cancelled) setSaveErr("");
      })
      .catch((e) => {
        if (!cancelled) {
          setSaveErr(
            e instanceof Error ? e.message : "Could not save encrypted vault"
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state, vaultGate]);

  // Auto-lock after 12 minutes idle — key wiped from RAM
  useEffect(() => {
    if (vaultGate !== "ready") return;
    const bump = () => {
      if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        lockVault();
        setState(null);
        setVaultPass("");
        setVaultPass2("");
        setVaultGate("unlock");
        setVaultErr("Locked after idle — unlock with your passphrase.");
      }, 12 * 60 * 1000);
    };
    bump();
    const evs = ["pointerdown", "keydown", "scroll"] as const;
    for (const e of evs) window.addEventListener(e, bump, { passive: true });
    return () => {
      if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
      for (const e of evs) window.removeEventListener(e, bump);
    };
  }, [vaultGate]);

  async function onSetupVault() {
    setVaultErr("");
    if (vaultPass.length < 8) {
      setVaultErr("Passphrase needs at least 8 characters.");
      return;
    }
    if (vaultPass !== vaultPass2) {
      setVaultErr("Passphrases do not match.");
      return;
    }
    setVaultBusy(true);
    try {
      const base = state || loadFinance();
      await setupVault(vaultPass, base);
      wipePlainFinanceKeys();
      setState(base);
      setVaultPass("");
      setVaultPass2("");
      setVaultGate("ready");
    } catch (e) {
      setVaultErr(e instanceof Error ? e.message : "Could not lock vault");
    } finally {
      setVaultBusy(false);
    }
  }

  async function onUnlockVault() {
    setVaultErr("");
    setVaultBusy(true);
    try {
      const next = await unlockVault(vaultPass);
      setState(next);
      setVaultPass("");
      setVaultGate("ready");
    } catch (e) {
      setVaultErr(e instanceof Error ? e.message : "Unlock failed");
    } finally {
      setVaultBusy(false);
    }
  }

  function onLockNow() {
    lockVault();
    setState(null);
    setVaultPass("");
    setVaultPass2("");
    setVaultGate("unlock");
    setVaultErr("");
  }

  useEffect(() => {
    void fetch("/api/finance/plaid/status")
      .then((r) => r.json())
      .then((d) => setPlaid(d as PlaidStatus))
      .catch(() =>
        setPlaid({
          ready: false,
          message: "Plaid offline — CSV import still works.",
        })
      );
  }, []);

  const ym = filterMonth === "all" ? monthKey() : filterMonth || monthKey();
  const txs = state?.txs || [];
  const accounts = state?.accounts || [];
  const spentMap = useMemo(() => spentByCategory(txs, ym), [txs, ym]);
  const income = useMemo(() => monthIncome(txs, ym), [txs, ym]);
  const expense = useMemo(() => monthExpense(txs, ym), [txs, ym]);
  const worth = netWorth(accounts);
  const cash = cashOnHand(accounts);
  const debt = creditOwed(accounts);
  const inv = invested(accounts);
  const cashFlow = income - expense;
  const rate = useMemo(() => savingsRate(txs, ym), [txs, ym]);
  const goals = state?.goals || [];
  const months = useMemo(() => recentMonthKeys(12), []);
  const series = useMemo(() => monthlySeries(txs, 6), [txs]);
  const bars = useMemo(() => dailyBars(txs, ym), [txs, ym]);
  const merchants = useMemo(() => topMerchants(txs, ym, 8), [txs, ym]);

  const budget = state?.budget || [];
  const categories = useMemo(() => {
    const set = new Set<string>([
      ...FINANCE_CATEGORIES,
      ...budget.map((b) => b.category),
      ...txs.map((t) => t.category),
    ]);
    return Array.from(set);
  }, [budget, txs]);

  const planRows = useMemo(() => {
    return PLAN_GROUPS.map((g) => {
      const planned = g.cats.reduce((s, c) => {
        const b = budget.find((x) => x.category === c);
        return s + (b?.planned || 0);
      }, 0);
      const spent = g.cats.reduce((s, c) => s + (spentMap[c] || 0), 0);
      return {
        ...g,
        planned,
        spent,
        remaining: planned - spent,
      };
    });
  }, [budget, spentMap]);

  const planPlanned = planRows.reduce((s, r) => s + r.planned, 0);
  const planSpent = planRows.reduce((s, r) => s + r.spent, 0);

  /** Real decision engine — ranks next moves from live data */
  const brief = useMemo(
    () =>
      state
        ? buildSmartBrief(state, ym, planRows, creditReport)
        : buildSmartBrief(
            {
              version: 2,
              accounts: [],
              txs: [],
              budget: [],
              watchlist: [],
              goals: [],
              creditProfile: null,
            },
            ym,
            planRows,
            creditReport
          ),
    [state, ym, planRows, creditReport]
  );
  const safeToSpend = brief.safeToSpend;
  const runwayMonths = brief.runwayMonths;

  const ledger = useMemo(() => {
    let list = [...txs];
    if (filterMonth !== "all") {
      list = list.filter((t) => t.date.startsWith(filterMonth));
    }
    if (filterKind !== "all") list = list.filter((t) => t.kind === filterKind);
    if (filterCat !== "all") list = list.filter((t) => t.category === filterCat);
    if (filterQ.trim()) {
      const q = filterQ.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.merchant || "").toLowerCase().includes(q) ||
          (t.note || "").toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "merchant")
        cmp = (a.merchant || a.note || "").localeCompare(
          b.merchant || b.note || ""
        );
      else if (sortKey === "category") cmp = a.category.localeCompare(b.category);
      else if (sortKey === "kind") cmp = a.kind.localeCompare(b.kind);
      else cmp = a.amount - b.amount;
      return cmp * dir;
    });
    return list;
  }, [txs, filterMonth, filterKind, filterCat, filterQ, sortKey, sortDir]);

  /** Running balance after each tx (full books, not just filter) */
  const balanceById = useMemo(() => runningBalanceMap(txs), [txs]);

  /** Rockefeller discipline score + open gaps */
  const gaps = useMemo(
    () =>
      state
        ? bookkeeperGaps(state, ym)
        : bookkeeperGaps(
            {
              version: 2,
              accounts: [],
              txs: [],
              budget: [],
              watchlist: [],
              goals: [],
              creditProfile: null,
            },
            ym
          ),
    [state, ym]
  );

  const maxBar = useMemo(() => {
    const m = Math.max(1, ...bars.map((b) => Math.abs(b.net)));
    return m;
  }, [bars]);

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

  function onLedgerPaste(e: ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    e.preventDefault();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const added: FinanceTx[] = [];
    for (const line of lines) {
      const cols =
        line.split("\t").length > 1 ? line.split("\t") : line.split(",");
      const dateRaw = (cols[0] || "").trim();
      const merchant = (cols[1] || "").trim();
      const amountRaw = (cols[2] || "").replace(/[$,]/g, "").trim();
      const amount = Math.abs(Number(amountRaw));
      if (!amount || Number.isNaN(amount)) continue;
      let date = dateRaw;
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateRaw)) {
        const [mm, dd, yy] = dateRaw.split("/");
        const y = yy.length === 2 ? `20${yy}` : yy;
        date = `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = new Date().toISOString().slice(0, 10);
      }
      const isNeg = amountRaw.trim().startsWith("-") || Number(amountRaw) < 0;
      added.push(
        newTx({
          date,
          merchant: merchant || "Pasted",
          note: merchant || "Pasted",
          amount,
          category: (cols[3] || "Uncategorized").trim() || "Uncategorized",
          kind: isNeg ? "expense" : "expense",
          source: "import",
        })
      );
    }
    if (!added.length) {
      setImportNote("Paste failed — use Date · Merchant · Amount · Category");
      return;
    }
    setState((s) => {
      const merged = mergeTxs(s.txs, added);
      return { ...s, txs: merged.txs };
    });
    setImportNote(`Pasted ${added.length} rows`);
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

  /** Zero typing — plan built from your real spend history */
  function autoBuildPlan() {
    setState((s) => ({
      ...s,
      budget: autoBudgetFromHistory(s.txs, s.budget, 3),
    }));
    setImportNote(
      "Plan auto-built from your last ~3 months of spending. No typing."
    );
    setTab("plan");
  }

  function planMatchLastMonth() {
    setState((s) => ({
      ...s,
      budget: budgetFromLastMonth(s.txs, s.budget),
    }));
    setImportNote("Plan matched last month’s actual spend.");
    setTab("plan");
  }

  function planTighten() {
    setState((s) => ({
      ...s,
      budget: scaleBudget(s.budget, 0.9),
    }));
    setImportNote("Plan tightened 10% across categories.");
  }

  function planLoosen() {
    setState((s) => ({
      ...s,
      budget: scaleBudget(s.budget, 1.1),
    }));
    setImportNote("Plan loosened 10% across categories.");
  }

  function nudgeBudget(category: string, delta: number) {
    setState((s) => {
      const cur = s.budget.find((b) => b.category === category)?.planned || 0;
      const next = Math.max(0, Math.ceil((cur + delta) / 5) * 5);
      const exists = s.budget.some((b) => b.category === category);
      return {
        ...s,
        budget: exists
          ? s.budget.map((b) =>
              b.category === category ? { ...b, planned: next } : b
            )
          : [...s.budget, { category, planned: next }],
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
    setTab("transactions");
  }

  function loadDemo() {
    const seed = demoSeedTxs();
    setState((s) => {
      const merged = mergeTxs(s.txs, seed);
      const accounts = s.accounts.map((a) => {
        if (a.kind === "checking")
          return { ...a, balance: Math.max(a.balance, 4200) };
        if (a.kind === "savings")
          return { ...a, balance: Math.max(a.balance, 8500) };
        if (a.kind === "credit")
          return {
            ...a,
            balance: Math.max(a.balance, 1840),
            creditLimit: a.creditLimit || 5000,
          };
        return a;
      });
      const goals =
        s.goals && s.goals.length
          ? s.goals
          : [
              newGoal({ name: "Emergency fund", target: 10000, saved: 6800 }),
              newGoal({ name: "Japan trip", target: 3500, saved: 1480 }),
              newGoal({ name: "Pay off card", target: 2400, saved: 1100 }),
            ];
      const budget = s.budget.map((b) => {
        if (b.category === "Rent / housing") return { ...b, planned: 1850 };
        if (b.category === "Food / groceries") return { ...b, planned: 450 };
        if (b.category === "Restaurants / coffee")
          return { ...b, planned: 280 };
        if (b.category === "Transport") return { ...b, planned: 120 };
        if (b.category === "Subscriptions") return { ...b, planned: 60 };
        if (b.category === "Fun") return { ...b, planned: 200 };
        return b;
      });
      return { ...s, txs: merged.txs, accounts, goals, budget };
    });
    setImportNote("Demo month loaded.");
    setTab("overview");
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
        `Imported ${result.added.length} new · skipped ${result.skipped} duplicates`
      );
      setTab("transactions");
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

  function answerMoney(q: string) {
    if (!q.trim()) return;
    setAskA(
      answerFromBrief(q, brief, {
        worth,
        cash,
        debt,
        income,
        expense,
        cashFlow,
        rate,
        credit: creditReport,
        txCount: state.txs.length,
      })
    );
  }

  function runSmartAction(actionId: string, tab?: TabId) {
    if (actionId === "auto-plan" || actionId === "import" || actionId.startsWith("over-")) {
      if (actionId === "auto-plan") autoBuildPlan();
      else if (tab) setTab(tab);
      return;
    }
    if (tab) setTab(tab);
  }

  async function plaidSandboxConnect() {
    setPlaidBusy(true);
    setPlaidNote("Connecting sandbox bank…");
    try {
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
    setPlaidNote("Syncing…");
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
              institutionName || s.plaidMeta?.institutionName || "Bank",
            linkedAt: new Date().toISOString(),
          },
        };
      });
      setPlaidNote(
        `Synced ${(data.accounts || []).length} accounts · ${(data.transactions || []).length} txs`
      );
      setTab("transactions");
    } catch (e) {
      setPlaidNote(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setPlaidBusy(false);
    }
  }

  const tabTitle =
    NAV.find((n) => n.id === tab)?.label || "Ledger";

  // ── Vault gate (no numbers until encrypted + unlocked) ──
  if (vaultGate !== "ready" || !state) {
    const isUnlock = vaultGate === "unlock" || hasEncryptedVault();
    return (
      <div className="wd">
        <div className="wd-main">
          <section className="wd-vault" aria-label="Encrypted finance vault">
            <p className="wd-kicker">Encrypted vault · AES-256</p>
            <h1>{isUnlock ? "Unlock your books" : "Lock your books"}</h1>
            <p className="wd-vault-copy">
              {isUnlock
                ? "Your ledger is encrypted on this device. Enter your passphrase to open it. The key never leaves this browser tab."
                : "Set a passphrase to encrypt every account, transaction, and plan. Plain copies are wiped. Forget it and the data stays locked forever — write it down somewhere safe."}
            </p>
            <label className="wd-vault-label">
              Passphrase
              <input
                type="password"
                autoComplete={isUnlock ? "current-password" : "new-password"}
                value={vaultPass}
                onChange={(e) => setVaultPass(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (isUnlock) void onUnlockVault();
                    else void onSetupVault();
                  }
                }}
                placeholder="At least 8 characters"
              />
            </label>
            {!isUnlock ? (
              <label className="wd-vault-label">
                Confirm passphrase
                <input
                  type="password"
                  autoComplete="new-password"
                  value={vaultPass2}
                  onChange={(e) => setVaultPass2(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onSetupVault();
                  }}
                  placeholder="Type it again"
                />
              </label>
            ) : null}
            {vaultErr ? <p className="wd-vault-err">{vaultErr}</p> : null}
            <button
              type="button"
              className="wd-btn wd-btn-primary"
              disabled={vaultBusy}
              onClick={() =>
                void (isUnlock ? onUnlockVault() : onSetupVault())
              }
            >
              {vaultBusy
                ? "Working…"
                : isUnlock
                  ? "Unlock ledger"
                  : "Encrypt & open"}
            </button>
            <p className="wd-vault-note">
              Uses AES-GCM with a key derived from your passphrase (PBKDF2 ·
              310k rounds). Not bank-grade against malware that watches you type
              — but no plain money data sits in storage for snoopers.
            </p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="wd">
      {/* Single column — no second sidebar. Tabs live in the page like Fitness. */}
      <div className="wd-main">
        <header className="wd-top">
          <div className="wd-top-titles">
            <p className="wd-kicker">Personal ledger · encrypted vault</p>
            <h1>{tabTitle}</h1>
            <p className="wd-top-principle">
              Every dollar named. Every cent recorded. Locked when you leave.
            </p>
          </div>
          <div className="wd-top-actions">
            <button
              type="button"
              className="wd-btn"
              onClick={onLockNow}
              title="Lock vault — wipes key from memory"
            >
              Lock
            </button>
            <select
              className="wd-select"
              value={filterMonth === "all" ? monthKey() : filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              aria-label="Period"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m === monthKey() ? "This month" : m}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="wd-btn"
              onClick={() => fileRef.current?.click()}
            >
              Import
            </button>
            <button type="button" className="wd-btn" onClick={downloadCsv}>
              Export books
            </button>
            {state.txs.length === 0 ? (
              <button type="button" className="wd-btn" onClick={loadDemo}>
                Demo
              </button>
            ) : null}
            <button
              type="button"
              className="wd-btn wd-btn-primary"
              onClick={() => {
                setShowTxForm(true);
                setTab("transactions");
              }}
            >
              + Entry
            </button>
          </div>
          {importNote ? <p className="wd-note wd-top-note">{importNote}</p> : null}
          {saveErr ? (
            <p className="wd-note wd-top-note wd-vault-err">{saveErr}</p>
          ) : null}
        </header>

        {/* Discipline strip — always visible, like a bookkeeper’s daily checklist */}
        <section className="wd-discipline" aria-label="Bookkeeper discipline">
          <div className="wd-discipline-score">
            <span>Discipline</span>
            <strong
              className={
                gaps.disciplineScore >= 80
                  ? "is-good"
                  : gaps.disciplineScore >= 50
                    ? "is-mid"
                    : "is-low"
              }
            >
              {gaps.disciplineScore}
            </strong>
          </div>
          <ul className="wd-discipline-list">
            <li className={gaps.noTxThisMonth ? "is-open" : "is-done"}>
              {gaps.noTxThisMonth
                ? "No entries this month — open the ledger"
                : `${state.txs.filter((t) => t.date.startsWith(ym)).length} entries this period`}
            </li>
            <li className={gaps.uncategorized > 0 ? "is-open" : "is-done"}>
              {gaps.uncategorized > 0
                ? `${gaps.uncategorized} uncategorized — name every line`
                : "Every line categorized"}
            </li>
            <li className={gaps.blankMerchant > 0 ? "is-open" : "is-done"}>
              {gaps.blankMerchant > 0
                ? `${gaps.blankMerchant} blank payees — write who got the money`
                : "Every payee named"}
            </li>
            <li className={gaps.noAccounts ? "is-open" : "is-done"}>
              {gaps.noAccounts
                ? "No accounts — set cash, bank, and credit"
                : `${state.accounts.length} accounts on the books`}
            </li>
          </ul>
          <p className="wd-discipline-rule">
            {BOOKKEEPER_RULES[new Date().getDate() % BOOKKEEPER_RULES.length]}
          </p>
        </section>

        {/* In-page subnav — same pattern as Fitness (Sleep · Meals · Gym) */}
        <nav className="wd-subnav" aria-label="Finance sections">
          {NAV.map((n, i) => (
            <span key={n.id} className="wd-subnav-item">
              {i > 0 ? (
                <span className="wd-subnav-dot" aria-hidden>
                  ·
                </span>
              ) : null}
              <button
                type="button"
                className={`wd-subnav-link${tab === n.id ? " is-active" : ""}`}
                onClick={() => setTab(n.id)}
              >
                {n.label}
              </button>
            </span>
          ))}
        </nav>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => onCsvFile(e.target.files?.[0] || null)}
        />

        {/* ════════ BOOKS (period summary) ════════ */}
        {tab === "overview" ? (
          <div className="wd-overview">
            {/* Bookkeeper period close — not a vanity dashboard */}
            <section className="wd-panel wd-brain">
              <div className="wd-brain-top">
                <div>
                  <p className="wd-brain-k">Period · {ym}</p>
                  <h2 className="wd-brain-h">{brief.headline}</h2>
                  <p className="wd-muted">{brief.sub}</p>
                </div>
                <div className="wd-brain-q" title="Bookkeeper discipline this period">
                  <span>Discipline</span>
                  <strong>{gaps.disciplineScore}</strong>
                </div>
              </div>
              <div className="wd-book-rules">
                {BOOKKEEPER_RULES.map((rule) => (
                  <p key={rule}>{rule}</p>
                ))}
              </div>
              {brief.dataQuality.score < 50 ? (
                <div className="wd-brain-cta">
                  <button
                    type="button"
                    className="wd-btn wd-btn-primary"
                    onClick={() =>
                      state.txs.length === 0 ? loadDemo() : autoBuildPlan()
                    }
                  >
                    {state.txs.length === 0
                      ? "Load demo to see the brain work"
                      : "Auto-build plan from spend"}
                  </button>
                  <button
                    type="button"
                    className="wd-btn"
                    onClick={() => fileRef.current?.click()}
                  >
                    Import bank CSV
                  </button>
                </div>
              ) : null}
              {brief.dataQuality.hasTxs ? (
                <p className="wd-muted wd-brain-proj">
                  Pace: {money(brief.projection.burnPerDay)}/day · Projected
                  month-end flow{" "}
                  <strong
                    className={
                      brief.projection.projectedFlow < 0 ? "is-neg" : "is-pos"
                    }
                  >
                    {money(brief.projection.projectedFlow)}
                  </strong>{" "}
                  · day {brief.projection.dayOfMonth}/
                  {brief.projection.daysInMonth}
                </p>
              ) : null}
            </section>

            {/* Snapshot row */}
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Financial snapshot</h2>
                <span className="wd-chip">
                  {brief.dataQuality.score >= 70 ? "Live" : "Partial"}
                </span>
              </div>
              <div className="wd-snap">
                <div className="wd-metric">
                  <span>Net worth</span>
                  <strong className={worth < 0 ? "is-neg" : ""}>
                    {money(worth)}
                  </strong>
                  <em>
                    Cash {money(cash)} · Invested {money(inv)}
                  </em>
                </div>
                <div className="wd-metric">
                  <span>Safe to spend</span>
                  <strong>{money(safeToSpend)}</strong>
                  <em>cash − essentials left − debt floor − burn buffer</em>
                </div>
                <div className="wd-metric">
                  <span>Monthly cash flow</span>
                  <strong className={cashFlow < 0 ? "is-neg" : "is-pos"}>
                    {cashFlow >= 0 ? "+" : ""}
                    {money(cashFlow)}
                  </strong>
                  <em>
                    In {money(income)} · Out {money(expense)}
                  </em>
                </div>
                <div className="wd-metric">
                  <span>Runway</span>
                  <strong>
                    {runwayMonths > 24
                      ? "24+"
                      : runwayMonths.toFixed(1)}{" "}
                    <small>months</small>
                  </strong>
                  <em>
                    burn {money(brief.projection.burnPerDay)}/day
                  </em>
                </div>
              </div>
            </section>

            <div className="wd-grid-2">
              {/* Money in and out */}
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>Money in and out</h2>
                  <span className="wd-muted">{ym}</span>
                </div>
                <div className="wd-chart" aria-hidden>
                  {bars.map((b) => {
                    const h = Math.max(
                      2,
                      Math.round((Math.abs(b.net) / maxBar) * 100)
                    );
                    const up = b.net >= 0;
                    return (
                      <div key={b.day} className="wd-bar-col" title={`${ym}-${String(b.day).padStart(2,"0")}: ${money(b.net)}`}>
                        <div className="wd-bar-track">
                          {b.net !== 0 ? (
                            <i
                              className={up ? "is-in" : "is-out"}
                              style={{ height: `${h}%` }}
                            />
                          ) : (
                            <i className="is-zero" />
                          )}
                        </div>
                        {b.day % 4 === 1 || b.day === 28 ? (
                          <span>{b.day}</span>
                        ) : (
                          <span />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="wd-legend">
                  <span className="is-pos">Income days</span>
                  <span className="is-neg">Spend days</span>
                </div>
              </section>

              {/* Ranked next actions from the engine */}
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>Next moves</h2>
                  <span className="wd-muted">ranked by impact</span>
                </div>
                <ul className="wd-alerts">
                  {brief.actions.map((a) => (
                    <li key={a.id} className={`wd-sev-${a.severity}`}>
                      <div>
                        <strong>{a.title}</strong>
                        <p>{a.detail}</p>
                        <button
                          type="button"
                          className="wd-link"
                          onClick={() =>
                            runSmartAction(a.id, a.tab as TabId | undefined)
                          }
                        >
                          {a.cta} →
                        </button>
                      </div>
                      {a.amount != null ? (
                        <em
                          className={
                            a.severity === "good" ? "is-pos" : "is-neg"
                          }
                        >
                          {money(a.amount)}
                        </em>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="wd-grid-2">
              {/* Your plan */}
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>Your plan</h2>
                  <div className="wd-top-actions">
                    {planPlanned <= 0 ? (
                      <button
                        type="button"
                        className="wd-link"
                        onClick={autoBuildPlan}
                      >
                        Auto-build
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="wd-link"
                      onClick={() => setTab("plan")}
                    >
                      Open plan
                    </button>
                  </div>
                </div>
                <div className="wd-plan-table">
                  <div className="wd-plan-head">
                    <span>Category</span>
                    <span>Planned</span>
                    <span>Spent</span>
                    <span>Left</span>
                  </div>
                  {planRows.map((r) => {
                    const pct =
                      r.planned > 0
                        ? Math.min(100, Math.round((r.spent / r.planned) * 100))
                        : r.spent > 0
                          ? 100
                          : 0;
                    const over = r.planned > 0 && r.spent > r.planned;
                    return (
                      <div key={r.id} className="wd-plan-row">
                        <div className="wd-plan-cat">
                          <strong>{r.label}</strong>
                          <div className="wd-progress">
                            <i
                              className={over ? "is-over" : ""}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span>{money(r.planned)}</span>
                        <span>{money(r.spent)}</span>
                        <span className={r.remaining < 0 ? "is-neg" : ""}>
                          {money(r.remaining)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Safe to spend + learn */}
              <div className="wd-stack">
                <section className="wd-panel wd-safe">
                  <div className="wd-panel-head">
                    <h2>Safe to spend</h2>
                  </div>
                  <p className="wd-safe-num">{money(safeToSpend)}</p>
                  <p className="wd-muted">
                    Starting balance {money(cash)} · plan still open{" "}
                    {money(Math.max(0, planPlanned - planSpent))}
                  </p>
                </section>
                <section className="wd-panel">
                  <div className="wd-panel-head">
                    <h2>What the data says</h2>
                  </div>
                  <ul className="wd-learn">
                    <li>
                      Plan health:{" "}
                      <strong>{brief.planHealth}</strong>
                      {planPlanned > 0
                        ? ` · ${money(planSpent)} of ${money(planPlanned)} used`
                        : " · not built yet"}
                    </li>
                    <li>
                      Top leak:{" "}
                      <strong>
                        {brief.topLeak?.merchant || "not enough history"}
                      </strong>
                      {brief.topLeak
                        ? ` · ${money(brief.topLeak.total)} (${brief.topLeak.count}×)`
                        : ""}
                    </li>
                    <li>
                      Savings rate:{" "}
                      <strong>{rate == null ? "—" : `${rate}%`}</strong>
                      {" · "}
                      Projected EOM flow{" "}
                      <strong
                        className={
                          brief.projection.projectedFlow < 0
                            ? "is-neg"
                            : "is-pos"
                        }
                      >
                        {money(brief.projection.projectedFlow)}
                      </strong>
                    </li>
                  </ul>
                </section>
              </div>
            </div>

            {/* Goals rings */}
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Goals</h2>
                <button
                  type="button"
                  className="wd-link"
                  onClick={() => setTab("goals")}
                >
                  Manage
                </button>
              </div>
              {goals.length === 0 ? (
                <p className="wd-muted wd-pad">
                  No goals yet.{" "}
                  <button type="button" className="wd-link" onClick={() => setTab("goals")}>
                    Add one
                  </button>
                </p>
              ) : (
                <div className="wd-goals">
                  {goals.slice(0, 4).map((g) => {
                    const pct =
                      g.target > 0
                        ? Math.min(100, Math.round((g.saved / g.target) * 100))
                        : 0;
                    const r = 36;
                    const c = 2 * Math.PI * r;
                    const offset = c - (pct / 100) * c;
                    return (
                      <div key={g.id} className="wd-goal">
                        <svg viewBox="0 0 88 88" className="wd-ring" aria-hidden>
                          <circle cx="44" cy="44" r={r} className="wd-ring-bg" />
                          <circle
                            cx="44"
                            cy="44"
                            r={r}
                            className="wd-ring-fg"
                            strokeDasharray={c}
                            strokeDashoffset={offset}
                          />
                          <text x="44" y="48" textAnchor="middle">
                            {pct}%
                          </text>
                        </svg>
                        <div>
                          <strong>{g.name}</strong>
                          <p>
                            {money(g.saved)} of {money(g.target)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Recent transactions */}
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Recent transactions</h2>
                <button
                  type="button"
                  className="wd-link"
                  onClick={() => setTab("transactions")}
                >
                  View all
                </button>
              </div>
              <div className="wd-table-wrap">
                <table className="wd-table">
                  <thead>
                    <tr>
                      <th>Merchant</th>
                      <th>Category</th>
                      <th>Date</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.txs.slice(0, 8).map((t) => (
                      <tr key={t.id}>
                        <td>{t.merchant || t.note || "—"}</td>
                        <td>{t.category}</td>
                        <td>{t.date}</td>
                        <td
                          className={`num ${
                            t.kind === "income" ? "is-pos" : "is-neg"
                          }`}
                        >
                          {t.kind === "income" ? "+" : "−"}
                          {moneyExact(t.amount)}
                        </td>
                      </tr>
                    ))}
                    {state.txs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="wd-muted">
                          No transactions — load demo or import CSV.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Ask Wonder */}
            <section className="wd-panel wd-ask">
              <div className="wd-panel-head">
                <h2>Ask Wonder about my money</h2>
              </div>
              <div className="wd-ask-row">
                <input
                  value={askQ}
                  onChange={(e) => setAskQ(e.target.value)}
                  placeholder="Can I afford a $1,200 trip in October?"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") answerMoney(askQ);
                  }}
                />
                <button
                  type="button"
                  className="wd-btn wd-btn-primary"
                  onClick={() => answerMoney(askQ)}
                >
                  Ask
                </button>
              </div>
              {askA ? <p className="wd-ask-a">{askA}</p> : null}
              <div className="wd-ask-chips">
                {[
                  "Can I afford a trip?",
                  "How is my credit?",
                  "What's my runway?",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="wd-chip-btn"
                    onClick={() => {
                      setAskQ(q);
                      answerMoney(q);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {/* ════════ LEDGER (daybook) ════════ */}
        {tab === "transactions" ? (
          <div className="wd-page">
            <section className="wd-panel">
              <div className="wd-panel-head">
                <div>
                  <h2>Daybook · every entry</h2>
                  <p className="wd-muted wd-ledger-sub">
                    Income in · expense out · running balance in cents. Paste bank
                    rows (date, amount, payee) straight into the table.
                  </p>
                </div>
                <div className="wd-top-actions">
                  <button
                    type="button"
                    className="wd-btn"
                    onClick={addBlankSheetRow}
                  >
                    + Row
                  </button>
                  <button
                    type="button"
                    className="wd-btn wd-btn-primary"
                    onClick={() => setShowTxForm((v) => !v)}
                  >
                    {showTxForm ? "Close form" : "Add entry"}
                  </button>
                </div>
              </div>

              {/* Period totals — bookkeeper close strip */}
              <div className="wd-ledger-close">
                <span>
                  Income{" "}
                  <strong className="is-pos">
                    {moneyCents(monthIncome(state.txs, ym))}
                  </strong>
                </span>
                <span>
                  Expense{" "}
                  <strong className="is-neg">
                    {moneyCents(monthExpense(state.txs, ym))}
                  </strong>
                </span>
                <span>
                  Net{" "}
                  <strong
                    className={
                      monthIncome(state.txs, ym) - monthExpense(state.txs, ym) >=
                      0
                        ? "is-pos"
                        : "is-neg"
                    }
                  >
                    {moneyCents(
                      monthIncome(state.txs, ym) - monthExpense(state.txs, ym)
                    )}
                  </strong>
                </span>
                <span>
                  Lines <strong>{ledger.length}</strong>
                </span>
              </div>

              {showTxForm ? (
                <div className="wd-form">
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
                        setTxDraft((d) => ({
                          ...d,
                          category: e.target.value,
                        }))
                      }
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wd-wide">
                    Merchant
                    <input
                      value={txDraft.note}
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
                    className="wd-btn wd-btn-primary"
                    onClick={addTx}
                  >
                    Save
                  </button>
                </div>
              ) : null}

              <div className="wd-filters">
                <input
                  type="search"
                  placeholder="Search…"
                  value={filterQ}
                  onChange={(e) => setFilterQ(e.target.value)}
                />
                <select
                  value={filterKind}
                  onChange={(e) =>
                    setFilterKind(e.target.value as "all" | TxKind)
                  }
                >
                  <option value="all">All types</option>
                  <option value="expense">Expenses</option>
                  <option value="income">Income</option>
                </select>
                <select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className="wd-table-wrap"
                onPaste={onLedgerPaste}
                tabIndex={0}
              >
                <table className="wd-table wd-edit wd-ledger-table">
                  <thead>
                    <tr>
                      <th>
                        <button type="button" onClick={() => toggleSort("date")}>
                          Date
                        </button>
                      </th>
                      <th>
                        <button
                          type="button"
                          onClick={() => toggleSort("merchant")}
                        >
                          Payee
                        </button>
                      </th>
                      <th>
                        <button
                          type="button"
                          onClick={() => toggleSort("category")}
                        >
                          Category
                        </button>
                      </th>
                      <th>
                        <button type="button" onClick={() => toggleSort("kind")}>
                          Dr/Cr
                        </button>
                      </th>
                      <th className="num">
                        <button
                          type="button"
                          onClick={() => toggleSort("amount")}
                        >
                          Amount
                        </button>
                      </th>
                      <th className="num" title="Running balance after this line">
                        Balance
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.slice(0, 400).map((t) => (
                      <tr
                        key={t.id}
                        className={
                          !t.category ||
                          t.category === "Uncategorized" ||
                          t.category === "Other" ||
                          !(t.merchant || t.note || "").trim()
                            ? "is-gap"
                            : undefined
                        }
                      >
                        <td>
                          <input
                            type="date"
                            value={t.date}
                            onChange={(e) =>
                              patchTx(t.id, { date: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={t.merchant || t.note || ""}
                            placeholder="Who · what"
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
                            value={t.kind}
                            onChange={(e) =>
                              patchTx(t.id, {
                                kind: e.target.value as TxKind,
                              })
                            }
                          >
                            <option value="expense">Dr · out</option>
                            <option value="income">Cr · in</option>
                          </select>
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            step="0.01"
                            className={
                              t.kind === "income" ? "is-pos" : "is-neg"
                            }
                            value={t.amount || ""}
                            onChange={(e) =>
                              patchTx(t.id, {
                                amount: Math.max(
                                  0,
                                  Math.round(
                                    (Number(e.target.value) || 0) * 100
                                  ) / 100
                                ),
                              })
                            }
                          />
                        </td>
                        <td
                          className={`num wd-balance ${
                            (balanceById.get(t.id) || 0) >= 0
                              ? "is-pos"
                              : "is-neg"
                          }`}
                        >
                          {moneyCents(balanceById.get(t.id) || 0)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="wd-x"
                            onClick={() => removeTx(t.id)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                    {ledger.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="wd-muted">
                          Empty daybook — add an entry, import CSV, or paste
                          bank rows. A meticulous bookkeeper never leaves a day
                          blank on purpose.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="wd-quick">
                <span className="wd-quick-label">Quick post</span>
                {QUICK_ADDS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    className="wd-chip-btn"
                    onClick={() => quickAdd(q)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {/* ════════ PLAN ════════ */}
        {tab === "plan" ? (
          <div className="wd-page">
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Monthly plan · {ym}</h2>
                <span className="wd-muted">
                  {money(planSpent)} of {money(planPlanned)} planned
                </span>
              </div>

              {/* Zero typing — big automation buttons */}
              <div className="wd-auto-bar">
                <button
                  type="button"
                  className="wd-btn wd-btn-primary"
                  onClick={autoBuildPlan}
                  disabled={state.txs.length === 0}
                >
                  Auto-build from my spending
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={planMatchLastMonth}
                  disabled={state.txs.length === 0}
                >
                  Match last month
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={planTighten}
                  disabled={planPlanned <= 0}
                >
                  Tighten −10%
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={planLoosen}
                  disabled={planPlanned <= 0}
                >
                  Loosen +10%
                </button>
                {state.txs.length === 0 ? (
                  <button
                    type="button"
                    className="wd-btn"
                    onClick={loadDemo}
                  >
                    Load demo first
                  </button>
                ) : null}
              </div>
              <p className="wd-muted wd-pad">
                No typing. Import bank CSV or connect Plaid → tap Auto-build.
                Nudge with + / − if you want.
              </p>

              {state.budget.map((b) => {
                const spent = spentMap[b.category] || 0;
                const pct =
                  b.planned > 0
                    ? Math.min(100, Math.round((spent / b.planned) * 100))
                    : spent > 0
                      ? 100
                      : 0;
                const over = b.planned > 0 && spent > b.planned;
                return (
                  <div key={b.category} className="wd-budget-row">
                    <div className="wd-budget-main">
                      <strong>{b.category}</strong>
                      <div className="wd-progress">
                        <i
                          className={over ? "is-over" : ""}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <em>
                        Spent {money(spent)}
                        {b.planned > 0 ? ` · Plan ${money(b.planned)}` : " · no plan yet"}
                      </em>
                    </div>
                    <div className="wd-nudge">
                      <button
                        type="button"
                        className="wd-btn"
                        aria-label="Decrease"
                        onClick={() => nudgeBudget(b.category, -25)}
                      >
                        −
                      </button>
                      <span className="wd-nudge-val">{money(b.planned)}</span>
                      <button
                        type="button"
                        className="wd-btn"
                        aria-label="Increase"
                        onClick={() => nudgeBudget(b.category, 25)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        ) : null}

        {/* ════════ GOALS ════════ */}
        {tab === "goals" ? (
          <div className="wd-page">
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Goals</h2>
              </div>
              <div className="wd-goals wd-goals-edit">
                {goals.map((g) => {
                  const pct =
                    g.target > 0
                      ? Math.min(100, Math.round((g.saved / g.target) * 100))
                      : 0;
                  return (
                    <div key={g.id} className="wd-goal-edit">
                      <input
                        className="wd-goal-name"
                        value={g.name}
                        onChange={(e) =>
                          patchGoal(g.id, { name: e.target.value })
                        }
                      />
                      <div className="wd-progress">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                      <div className="wd-goal-fields">
                        <label>
                          Saved
                          <input
                            type="number"
                            value={g.saved || ""}
                            onChange={(e) =>
                              patchGoal(g.id, {
                                saved: Math.max(
                                  0,
                                  Number(e.target.value) || 0
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Target
                          <input
                            type="number"
                            value={g.target || ""}
                            onChange={(e) =>
                              patchGoal(g.id, {
                                target: Math.max(
                                  0,
                                  Number(e.target.value) || 0
                                ),
                              })
                            }
                          />
                        </label>
                        <em>{pct}%</em>
                        <button
                          type="button"
                          className="wd-x"
                          onClick={() => removeGoal(g.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="wd-form">
                <label>
                  Name
                  <input
                    value={goalDraft.name}
                    onChange={(e) =>
                      setGoalDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    placeholder="Emergency fund"
                  />
                </label>
                <label>
                  Target
                  <input
                    type="number"
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
                  Saved
                  <input
                    type="number"
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
                  className="wd-btn wd-btn-primary"
                  onClick={addGoal}
                >
                  Add goal
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* ════════ INSIGHTS ════════ */}
        {tab === "insights" ? (
          <div className="wd-page">
            <div className="wd-grid-2">
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>Credit health</h2>
                  <span className="wd-chip">{creditReport.band}</span>
                </div>
                <p className="wd-safe-num">{creditReport.estimate}</p>
                <p className="wd-muted wd-pad">{creditReport.disclaimer}</p>
                <ul className="wd-alerts">
                  {creditReport.tips.slice(0, 4).map((t, i) => (
                    <li key={i}>
                      <div>
                        <strong>{t.title}</strong>
                        <p>
                          {t.why} {t.how}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>6-month cash flow</h2>
                </div>
                <div className="wd-month-bars">
                  {series.map((s) => {
                    const max = Math.max(
                      1,
                      ...series.map((x) => Math.max(x.income, x.expense))
                    );
                    return (
                      <div key={s.ym} className="wd-month-col">
                        <div className="wd-month-pair">
                          <i
                            className="is-in"
                            style={{
                              height: `${(s.income / max) * 80}px`,
                            }}
                          />
                          <i
                            className="is-out"
                            style={{
                              height: `${(s.expense / max) * 80}px`,
                            }}
                          />
                        </div>
                        <span>{s.ym.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="wd-form wd-credit-form">
                  <label>
                    On-time %
                    <input
                      type="number"
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
                    History years
                    <input
                      type="number"
                      value={creditProfile.historyYears}
                      onChange={(e) =>
                        patchCreditProfile({
                          historyYears: Math.max(
                            0,
                            Number(e.target.value) || 0
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Hard pulls
                    <input
                      type="number"
                      value={creditProfile.hardInquiries}
                      onChange={(e) =>
                        patchCreditProfile({
                          hardInquiries: Math.max(
                            0,
                            Number(e.target.value) || 0
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Known score
                    <input
                      type="number"
                      placeholder="optional"
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
              </section>
            </div>
          </div>
        ) : null}

        {/* ════════ ACCOUNTS ════════ */}
        {tab === "accounts" ? (
          <div className="wd-page">
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Accounts</h2>
                <button type="button" className="wd-btn" onClick={addAccount}>
                  + Account
                </button>
              </div>
              <div className="wd-table-wrap">
                <table className="wd-table wd-edit">
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
                            onChange={(e) =>
                              patchAccount(a.id, {
                                institution: e.target.value,
                              })
                            }
                          />
                        </td>
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
                          {a.kind === "credit" ? (
                            <input
                              type="number"
                              value={a.creditLimit ?? ""}
                              placeholder="limit"
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
                            className="wd-x"
                            onClick={() => removeAccount(a.id)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Add Chase / bank accounts</h2>
                <span
                  className={`wd-chip${plaid?.ready ? "" : " wd-chip-muted"}`}
                >
                  {plaid?.ready ? "Plaid ready" : "CSV mode"}
                </span>
              </div>

              <div className="wd-bank-cards">
                <article className="wd-bank-card">
                  <strong>Works right now · Chase CSV</strong>
                  <p>
                    Chase app or chase.com → Account → Download / Statements →
                    CSV → tap Import. Dupes auto-skip. Then open Plan →
                    Auto-build.
                  </p>
                  <button
                    type="button"
                    className="wd-btn wd-btn-primary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Import bank CSV
                  </button>
                </article>
                <article className="wd-bank-card">
                  <strong>Automatic · Plaid (Chase supported)</strong>
                  <p>
                    Free Plaid developer keys unlock one-click bank link
                    (Chase, Amex, Capital One, etc.). Without keys, sandbox
                    only works if configured.
                  </p>
                  <div className="wd-top-actions">
                    <button
                      type="button"
                      className="wd-btn"
                      disabled={plaidBusy || !plaid?.ready}
                      onClick={() => void plaidSandboxConnect()}
                    >
                      {plaidBusy ? "Working…" : "Connect (Plaid)"}
                    </button>
                    <button
                      type="button"
                      className="wd-btn"
                      disabled={plaidBusy || !state.plaidMeta?.itemId}
                      onClick={() => void plaidSync()}
                    >
                      Sync linked
                    </button>
                  </div>
                  {plaid && !plaid.ready ? (
                    <p className="wd-muted" style={{ marginTop: 10 }}>
                      Not linked yet: add PLAID_CLIENT_ID + PLAID_SECRET to
                      Wonder .env, restart. Free keys: dashboard.plaid.com
                    </p>
                  ) : null}
                </article>
              </div>

              {plaidNote ? <p className="wd-note wd-pad">{plaidNote}</p> : null}

              <div className="wd-risk">
                <h3>Data risks — straight talk</h3>
                <ul>
                  <li>
                    <strong>CSV import (safest for you):</strong> file never
                    leaves your computer. We read it in the browser and store
                    numbers in localStorage on this device only. No Wonder
                    server sees your Chase login.
                  </li>
                  <li>
                    <strong>Plaid connect:</strong> you log in through Plaid’s
                    secure flow (not our fake form). Plaid is used by tons of
                    apps; they hold the bank token. We only keep account
                    balances + transactions here. Risk: if this laptop is
                    unlocked, someone could open Wonder and see your money
                    data. Tokens in dev may live in server memory — don’t use
                    production secrets on a shared machine.
                  </li>
                  <li>
                    <strong>We do NOT store your Chase password.</strong> Ever.
                    If a site asks for your password outside Plaid/Chase, it’s
                    a scam.
                  </li>
                  <li>
                    <strong>Official credit scores</strong> still need Credit
                    Karma / your bank / AnnualCreditReport.com — we estimate
                    health tips, not a bureau hard pull.
                  </li>
                </ul>
              </div>

              {quotes.length > 0 ? (
                <div className="wd-watch">
                  {quotes.map((q) => (
                    <div key={q.symbol} className="wd-quote">
                      <b>{q.symbol}</b>
                      <strong>
                        {q.price != null ? moneyExact(q.price) : "—"}
                      </strong>
                      {q.changePct != null ? (
                        <small
                          className={q.changePct >= 0 ? "is-pos" : "is-neg"}
                        >
                          {q.changePct >= 0 ? "+" : ""}
                          {q.changePct.toFixed(2)}%
                        </small>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

