/**
 * Localhost intel feeds for Wonder World Monitor.
 * RSS + market quotes — no iframe, no frame-ancestors block.
 */

const newsCache = { at: 0, items: /** @type {Array<Record<string, unknown>>} */ ([]) };
const NEWS_TTL = 4 * 60_000;

const FEEDS = [
  {
    id: "hn",
    label: "Hacker News",
    kind: "hn",
    tags: ["tech"],
  },
  {
    id: "tc",
    label: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    tags: ["tech", "startups"],
  },
  {
    id: "verge",
    label: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    tags: ["tech"],
  },
  {
    id: "ars",
    label: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    tags: ["tech"],
  },
  {
    id: "mit",
    label: "MIT Tech Review",
    url: "https://www.technologyreview.com/feed/",
    tags: ["tech", "ai"],
  },
  {
    id: "biotech",
    label: "STAT News",
    url: "https://www.statnews.com/feed/",
    tags: ["biotech", "health"],
  },
  {
    id: "wsj-tech",
    label: "WSJ Tech",
    url: "https://feeds.a.dj.com/rss/RSSWSJD.xml",
    tags: ["tech", "markets"],
  },
];

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml, source, tags, limit = 12) {
  const items = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const block of blocks) {
    if (items.length >= limit) break;
    const title = stripHtml(
      (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) ||
        [])[1]
    );
    const link = stripHtml(
      (block.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) ||
        [])[1] ||
        (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1]
    );
    const pub =
      stripHtml(
        (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]
      ) || "";
    const desc = stripHtml(
      (block.match(
        /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i
      ) || [])[1]
    ).slice(0, 220);
    if (!title || !link) continue;
    items.push({
      id: `${source}-${items.length}-${title.slice(0, 24)}`,
      title,
      url: link.startsWith("http") ? link : `https://${link}`,
      source,
      tags,
      summary: desc,
      publishedAt: pub ? new Date(pub).toISOString() : null,
    });
  }
  return items;
}

async function fetchHn(limit = 20) {
  const idsRes = await fetch(
    "https://hacker-news.firebaseio.com/v0/topstories.json"
  );
  if (!idsRes.ok) throw new Error("HN failed");
  const ids = /** @type {number[]} */ (await idsRes.json());
  const slice = ids.slice(0, limit);
  const stories = await Promise.all(
    slice.map(async (id) => {
      const r = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`
      );
      if (!r.ok) return null;
      const s = await r.json();
      if (!s?.title) return null;
      return {
        id: `hn-${s.id}`,
        title: s.title,
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        source: "Hacker News",
        tags: ["tech"],
        summary: `${s.score || 0} points · ${s.by || "?"}`,
        publishedAt: s.time
          ? new Date(s.time * 1000).toISOString()
          : null,
        score: s.score,
      };
    })
  );
  return stories.filter(Boolean);
}

async function fetchRssFeed(feed) {
  const res = await fetch(feed.url, {
    headers: {
      "User-Agent": "WonderIntel/1.0 (+localhost)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) throw new Error(`${feed.label} ${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml, feed.label, feed.tags, 10);
}

async function fetchAllNews() {
  if (Date.now() - newsCache.at < NEWS_TTL && newsCache.items.length) {
    return newsCache.items;
  }
  const settled = await Promise.allSettled([
    fetchHn(20),
    fetchHnAlgolia("AI OR OpenAI OR startup OR semiconductor OR biotech OR chip", 18),
    ...FEEDS.filter((f) => f.url).map((f) => fetchRssFeed(f)),
  ]);
  /** @type {Array<Record<string, unknown>>} */
  const merged = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && Array.isArray(s.value)) {
      merged.push(...s.value);
    }
  }
  // de-dupe by title
  const seen = new Set();
  const unique = [];
  for (const item of merged) {
    const key = String(item.title || "")
      .toLowerCase()
      .slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  unique.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(String(a.publishedAt)) : 0;
    const tb = b.publishedAt ? Date.parse(String(b.publishedAt)) : 0;
    // boost scored HN items slightly when times equal
    if (tb === ta) return (Number(b.score) || 0) - (Number(a.score) || 0);
    return tb - ta;
  });
  newsCache.at = Date.now();
  newsCache.items = unique.slice(0, 80);
  return newsCache.items;
}

async function fetchCrypto() {
  try {
    return await fetchCryptoDeep();
  } catch {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true"
    );
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const data = await res.json();
    return [
      {
        symbol: "BTC",
        name: "Bitcoin",
        price: data.bitcoin?.usd ?? null,
        changePct: data.bitcoin?.usd_24h_change ?? null,
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        price: data.ethereum?.usd ?? null,
        changePct: data.ethereum?.usd_24h_change ?? null,
      },
      {
        symbol: "SOL",
        name: "Solana",
        price: data.solana?.usd ?? null,
        changePct: data.solana?.usd_24h_change ?? null,
      },
    ];
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function parseMoney(s) {
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof s !== "string") return null;
  const n = Number(s.replace(/[$,%+]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** Free — no API key. Rich chart meta (price, range, volume, 52w). */
async function yahooChart(symbol) {
  const hosts = ["query2", "query1"];
  let lastErr = null;
  for (const host of hosts) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`yahoo ${res.status}`);
      const data = JSON.parse(text);
      const result = data?.chart?.result?.[0];
      if (!result) throw new Error("empty");
      const meta = result.meta || {};
      const closes = (result?.indicators?.quote?.[0]?.close || []).filter(
        (n) => typeof n === "number"
      );
      const last =
        typeof meta.regularMarketPrice === "number"
          ? meta.regularMarketPrice
          : closes.at(-1) ?? null;
      const prev =
        typeof meta.chartPreviousClose === "number"
          ? meta.chartPreviousClose
          : closes.at(-2) ?? null;
      let changePct = null;
      let change = null;
      if (typeof last === "number" && typeof prev === "number" && prev !== 0) {
        change = last - prev;
        changePct = (change / prev) * 100;
      }
      if (last == null) throw new Error("no price");
      return {
        symbol: meta.symbol || symbol,
        shortName: meta.shortName || meta.longName || symbol,
        name: meta.longName || meta.shortName || symbol,
        exchange: meta.fullExchangeName || meta.exchangeName || null,
        currency: meta.currency || "USD",
        regularMarketPrice: last,
        previousClose: typeof prev === "number" ? prev : null,
        change,
        regularMarketChangePercent: changePct,
        dayHigh:
          typeof meta.regularMarketDayHigh === "number"
            ? meta.regularMarketDayHigh
            : null,
        dayLow:
          typeof meta.regularMarketDayLow === "number"
            ? meta.regularMarketDayLow
            : null,
        volume:
          typeof meta.regularMarketVolume === "number"
            ? meta.regularMarketVolume
            : null,
        fiftyTwoWeekHigh:
          typeof meta.fiftyTwoWeekHigh === "number" ? meta.fiftyTwoWeekHigh : null,
        fiftyTwoWeekLow:
          typeof meta.fiftyTwoWeekLow === "number" ? meta.fiftyTwoWeekLow : null,
        source: `yahoo-${host}`,
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("yahoo failed");
}

/** Free — no API key (Nasdaq public quote API) */
async function nasdaqQuote(symbol) {
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=stocks`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/",
    },
  });
  if (!res.ok) throw new Error(`nasdaq ${res.status}`);
  const data = await res.json();
  const primary = data?.data?.primaryData || {};
  const keyStats = data?.data?.keyStats || {};
  const price = parseMoney(primary.lastSalePrice);
  const changePct = parseMoney(primary.percentageChange);
  const change = parseMoney(primary.netChange);
  if (price == null) throw new Error("nasdaq empty");
  const dayRange = String(keyStats.dayrange?.value || "");
  const [dayLow, dayHigh] = dayRange.split("-").map((s) => parseMoney(s));
  const weekRange = String(keyStats.fiftyTwoWeekHighLow?.value || "");
  const [wLow, wHigh] = weekRange.split("-").map((s) => parseMoney(s));
  return {
    symbol: data?.data?.symbol || symbol,
    shortName: data?.data?.companyName || symbol,
    name: data?.data?.companyName || symbol,
    exchange: data?.data?.exchange || "NASDAQ",
    currency: "USD",
    regularMarketPrice: price,
    previousClose: change != null ? price - change : null,
    change,
    regularMarketChangePercent: changePct,
    dayHigh: dayHigh ?? null,
    dayLow: dayLow ?? null,
    volume: parseMoney(String(primary.volume || "").replace(/,/g, "")) ,
    fiftyTwoWeekHigh: wHigh ?? null,
    fiftyTwoWeekLow: wLow ?? null,
    bid: parseMoney(primary.bidPrice),
    ask: parseMoney(primary.askPrice),
    asOf: primary.lastTradeTimestamp || null,
    source: "nasdaq",
  };
}

/** Free — no API key (CNBC quote service) */
async function cnbcQuote(symbol) {
  const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(symbol)}&requestMethod=itv&noform=1&partnerId=2&fund=exsymnametype&output=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`cnbc ${res.status}`);
  const data = await res.json();
  const q = data?.FormattedQuoteResult?.FormattedQuote?.[0];
  if (!q) throw new Error("cnbc empty");
  const price = parseMoney(q.last);
  let pct = parseMoney(q.change_pct || q.changepct || q.changePercent);
  const ch = parseMoney(q.change);
  if (pct == null && ch != null && price != null && price - ch !== 0) {
    pct = (ch / (price - ch)) * 100;
  }
  if (price == null) throw new Error("cnbc no price");
  return {
    symbol: q.symbol || symbol,
    shortName: q.name || q.shortName || symbol,
    name: q.name || symbol,
    exchange: q.exchange || null,
    currency: "USD",
    regularMarketPrice: price,
    previousClose: ch != null ? price - ch : null,
    change: ch,
    regularMarketChangePercent: pct,
    dayHigh: parseMoney(q.high || q.High),
    dayLow: parseMoney(q.low || q.Low),
    volume: parseMoney(String(q.volume || "").replace(/,/g, "")),
    fiftyTwoWeekHigh: parseMoney(q.yrhiprice || q.year_high),
    fiftyTwoWeekLow: parseMoney(q.yrloprice || q.year_low),
    source: "cnbc",
  };
}

/** One symbol: try free sources in order — no API key required */
async function freeQuote(symbol) {
  const errors = [];
  // Prefer Yahoo first for depth (volume, 52w, day range)
  for (const fn of [yahooChart, nasdaqQuote, cnbcQuote]) {
    try {
      return await fn(symbol);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors.join("; ") || "all sources failed");
}

const INDEX_SYMBOLS = [
  { symbol: "^GSPC", cnbc: ".SPX", label: "S&P 500" },
  { symbol: "^IXIC", cnbc: ".IXIC", label: "Nasdaq" },
  { symbol: "^DJI", cnbc: ".DJI", label: "Dow" },
  { symbol: "^VIX", cnbc: ".VIX", label: "VIX" },
];

async function fetchIndices() {
  const out = [];
  for (const row of INDEX_SYMBOLS) {
    try {
      let q;
      try {
        q = await yahooChart(row.symbol);
      } catch {
        q = await cnbcQuote(row.cnbc);
      }
      out.push({
        ...q,
        label: row.label,
        symbol: row.symbol,
      });
      await new Promise((r) => setTimeout(r, 180));
    } catch {
      out.push({
        symbol: row.symbol,
        label: row.label,
        shortName: row.label,
        regularMarketPrice: null,
        regularMarketChangePercent: null,
      });
    }
  }
  return out;
}

async function fetchCryptoDeep() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&order=market_cap_desc&sparkline=false&price_change_percentage=24h"
  );
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data = await res.json();
  return data.map((x) => ({
    symbol: String(x.symbol || "").toUpperCase(),
    name: x.name,
    price: x.current_price ?? null,
    changePct: x.price_change_percentage_24h ?? null,
    marketCap: x.market_cap ?? null,
    volume24h: x.total_volume ?? null,
    high24h: x.high_24h ?? null,
    low24h: x.low_24h ?? null,
    rank: x.market_cap_rank ?? null,
  }));
}

async function fetchHnAlgolia(query, limit = 15) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("algolia failed");
  const data = await res.json();
  return (data.hits || []).map((h) => ({
    id: `hn-alg-${h.objectID}`,
    title: h.title || h.story_title || "(no title)",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: "HN · focused",
    tags: ["tech", "ai", "startup"],
    summary: `${h.points ?? 0} pts · ${h.author || "?"} · ${h.num_comments ?? 0} comments`,
    publishedAt: h.created_at || null,
    score: h.points,
  }));
}

const quoteCache = { at: 0, key: "", quotes: /** @type {any[]} */ ([]) };

async function fetchQuotes(symbolsCsv) {
  const symbols = symbolsCsv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 16);
  const key = symbols.join(",");
  // Cache 3 minutes so we stay under free-source rate limits
  if (
    quoteCache.key === key &&
    Date.now() - quoteCache.at < 180_000 &&
    quoteCache.quotes.some((q) => q.regularMarketPrice != null)
  ) {
    return quoteCache.quotes;
  }

  const out = [];
  for (const symbol of symbols) {
    try {
      out.push(await freeQuote(symbol));
      // gentle pacing between free providers
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // keep last cached value for this symbol if we have one
      const prev = quoteCache.quotes.find((q) => q.symbol === symbol);
      out.push(
        prev || {
          symbol,
          shortName: symbol,
          regularMarketPrice: null,
          regularMarketChangePercent: null,
        }
      );
    }
  }
  if (out.some((q) => q.regularMarketPrice != null)) {
    quoteCache.at = Date.now();
    quoteCache.key = key;
    quoteCache.quotes = out;
  } else if (quoteCache.quotes.length && quoteCache.key === key) {
    return quoteCache.quotes;
  }
  return out;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=30");
  res.end(JSON.stringify(body));
}

/** Yahoo raw.fmt / .raw number helper */
function yNum(node) {
  if (node == null) return null;
  if (typeof node === "number" && Number.isFinite(node)) return node;
  if (typeof node === "object" && typeof node.raw === "number") return node.raw;
  if (typeof node === "object" && typeof node.fmt === "string") {
    return parseMoney(node.fmt);
  }
  return null;
}

function yStr(node) {
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (typeof node === "object" && typeof node.fmt === "string") return node.fmt;
  return null;
}

/** Cache quarterly + charts aggressively so we never hammer free APIs */
const quarterlyCache = new Map();
const chartCache = new Map();
let secTickerMap = null; // { AAPL: "0000320193", ... }

const SEC_UA = "Wonder Markets Desk melani@local (personal research)";

/** Known mega-caps so we work even if SEC map fetch lags */
const KNOWN_CIK = {
  AAPL: "0000320193",
  MSFT: "0000789019",
  NVDA: "0001045810",
  GOOGL: "0001652044",
  GOOG: "0001652044",
  META: "0001326801",
  AMZN: "0001018724",
  TSLA: "0001318605",
  AMD: "0000002488",
  NFLX: "0001065280",
  AVGO: "0001730168",
  ORCL: "0001341439",
};

async function loadSecTickers() {
  if (secTickerMap) return secTickerMap;
  const map = { ...KNOWN_CIK };
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": SEC_UA, Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      for (const row of Object.values(data || {})) {
        const t = String(row.ticker || "").toUpperCase();
        const cik = String(row.cik_str || "").padStart(10, "0");
        if (t && cik) map[t] = cik;
      }
    }
  } catch {
    /* known map is enough for watchlist */
  }
  secTickerMap = map;
  return map;
}

/**
 * Pull last N quarterly values for an XBRL concept from SEC companyfacts.
 * Free, no API key — official filings (10-Q / 10-K).
 */
function secQuarterlySeries(factsRoot, conceptNames, limit = 8) {
  const usGaap = factsRoot?.facts?.["us-gaap"] || {};
  const ifrs = factsRoot?.facts?.ifrsFull || {};
  let units = null;
  for (const name of conceptNames) {
    const node = usGaap[name] || ifrs[name];
    if (!node?.units) continue;
    units =
      node.units.USD ||
      node.units["USD/shares"] ||
      Object.values(node.units)[0] ||
      null;
    if (units?.length) break;
  }
  if (!Array.isArray(units)) return [];
  // True quarters only: 10-Q, or frames like CY2024Q2 (skip pure annual CY2024)
  const rows = units
    .filter((u) => typeof u.val === "number" && u.end)
    .filter((u) => {
      const frame = String(u.frame || "");
      const fp = String(u.fp || "");
      const form = String(u.form || "");
      if (form === "10-Q") return true;
      if (/^Q[1-4]$/i.test(fp)) return true;
      if (/CY\d{4}Q[1-4]/i.test(frame)) return true;
      // Duration ~90 days ≈ quarter (SEC end-start)
      if (u.start && u.end) {
        const days =
          (Date.parse(u.end) - Date.parse(u.start)) / (1000 * 60 * 60 * 24);
        if (days > 60 && days < 120) return true;
      }
      return false;
    })
    .sort((a, b) => String(b.end).localeCompare(String(a.end)));
  // Dedupe by end date
  const seen = new Set();
  const out = [];
  for (const u of rows) {
    if (seen.has(u.end)) continue;
    seen.add(u.end);
    out.push({
      period: u.end,
      value: u.val,
      form: u.form || null,
      frame: u.frame || null,
      filed: u.filed || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * SEC-first fundamentals (beats Yahoo 429). Real quarterly revenue + net income.
 */
async function fetchQuarterlyFromSec(symbol) {
  const map = await loadSecTickers();
  const cik = map[symbol.toUpperCase()];
  if (!cik) throw new Error(`No SEC CIK for ${symbol}`);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SEC facts ${res.status}`);
  const data = await res.json();
  const entityName = data.entityName || symbol;

  const rev = secQuarterlySeries(data, [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
  ], 8);
  const ni = secQuarterlySeries(data, ["NetIncomeLoss", "ProfitLoss"], 8);
  const op = secQuarterlySeries(
    data,
    ["OperatingIncomeLoss", "OperatingProfitLoss"],
    8
  );
  const gp = secQuarterlySeries(data, ["GrossProfit"], 8);
  const eps = secQuarterlySeries(
    data,
    ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
    8
  );

  // Align by period end date
  const byPeriod = new Map();
  for (const r of rev) {
    byPeriod.set(r.period, {
      period: r.period,
      totalRevenue: r.value,
      netIncome: null,
      operatingIncome: null,
      grossProfit: null,
      eps: null,
    });
  }
  for (const r of ni) {
    const row = byPeriod.get(r.period) || {
      period: r.period,
      totalRevenue: null,
      netIncome: null,
      operatingIncome: null,
      grossProfit: null,
      eps: null,
    };
    row.netIncome = r.value;
    byPeriod.set(r.period, row);
  }
  for (const r of op) {
    const row = byPeriod.get(r.period);
    if (row) row.operatingIncome = r.value;
  }
  for (const r of gp) {
    const row = byPeriod.get(r.period);
    if (row) row.grossProfit = r.value;
  }
  for (const r of eps) {
    const row = byPeriod.get(r.period);
    if (row) row.eps = r.value;
  }

  const quarters = [...byPeriod.values()]
    .sort((a, b) => String(b.period).localeCompare(String(a.period)))
    .slice(0, 8);

  if (!quarters.length) throw new Error("SEC returned no quarterly rows");

  let revenueYoY = null;
  let revenueQoQ = null;
  if (
    quarters[0]?.totalRevenue != null &&
    quarters[3]?.totalRevenue != null &&
    quarters[3].totalRevenue !== 0
  ) {
    revenueYoY =
      ((quarters[0].totalRevenue - quarters[3].totalRevenue) /
        Math.abs(quarters[3].totalRevenue)) *
      100;
  }
  if (
    quarters[0]?.totalRevenue != null &&
    quarters[1]?.totalRevenue != null &&
    quarters[1].totalRevenue !== 0
  ) {
    revenueQoQ =
      ((quarters[0].totalRevenue - quarters[1].totalRevenue) /
        Math.abs(quarters[1].totalRevenue)) *
      100;
  }

  const profitMargins =
    quarters[0]?.totalRevenue && quarters[0]?.netIncome != null
      ? quarters[0].netIncome / quarters[0].totalRevenue
      : null;
  const operatingMargins =
    quarters[0]?.totalRevenue && quarters[0]?.operatingIncome != null
      ? quarters[0].operatingIncome / quarters[0].totalRevenue
      : null;

  const epsHistory = quarters.slice(0, 4).map((q) => ({
    period: q.period,
    epsActual: q.eps,
    epsEstimate: null,
    surprisePercent: null,
  }));

  return {
    symbol: symbol.toUpperCase(),
    name: entityName,
    sector: null,
    industry: null,
    cik,
    trailingPE: null,
    forwardPE: null,
    pegRatio: null,
    priceToBook: null,
    profitMargins,
    operatingMargins,
    revenueGrowth: revenueYoY != null ? revenueYoY / 100 : null,
    earningsGrowth: null,
    returnOnEquity: null,
    freeCashflow: null,
    totalCash: null,
    totalDebt: null,
    currentRatio: null,
    recommendationKey: null,
    targetMeanPrice: null,
    currentPrice: null,
    quarters: quarters.map((q) => ({
      period: q.period,
      periodLabel: q.period,
      totalRevenue: q.totalRevenue,
      grossProfit: q.grossProfit,
      operatingIncome: q.operatingIncome,
      netIncome: q.netIncome,
      ebit: null,
    })),
    epsHistory,
    trends: [],
    revenueYoY,
    revenueQoQ,
    yearlyEarnings: [],
    quarterlyEarningsChart: quarters
      .slice(0, 8)
      .reverse()
      .map((q) => ({
        date: q.period,
        revenue: q.totalRevenue,
        earnings: q.netIncome,
      })),
    updatedAt: new Date().toISOString(),
    source: "SEC EDGAR companyfacts (10-Q/10-K)",
  };
}

/** Slow Yahoo fallback if SEC fails (rarely needed) */
async function fetchQuarterlyFromYahoo(symbol) {
  const host = "query1";
  const modules = "earnings,defaultKeyStatistics,financialData,summaryProfile";
  const url = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    symbol
  )}?modules=${modules}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`yahoo summary ${res.status}`);
  const data = await res.json();
  const r = data?.quoteSummary?.result?.[0];
  if (!r) throw new Error("empty yahoo summary");
  const earn = r.earnings || {};
  const chartQ = (earn.financialsChart?.quarterly || []).slice(-8);
  const quarters = chartQ
    .slice()
    .reverse()
    .map((q) => ({
      period: String(q.date),
      periodLabel: String(q.date),
      totalRevenue: yNum(q.revenue),
      grossProfit: null,
      operatingIncome: null,
      netIncome: yNum(q.earnings),
      ebit: null,
    }));
  const fin = r.financialData || {};
  const stats = r.defaultKeyStatistics || {};
  const profile = r.summaryProfile || {};
  return {
    symbol: symbol.toUpperCase(),
    name: profile.longName || symbol,
    sector: profile.sector || null,
    industry: profile.industry || null,
    trailingPE: yNum(stats.trailingPE),
    forwardPE: yNum(stats.forwardPE),
    pegRatio: yNum(stats.pegRatio),
    priceToBook: yNum(stats.priceToBook),
    profitMargins: yNum(fin.profitMargins),
    operatingMargins: yNum(fin.operatingMargins),
    revenueGrowth: yNum(fin.revenueGrowth),
    earningsGrowth: yNum(fin.earningsGrowth),
    returnOnEquity: yNum(fin.returnOnEquity),
    freeCashflow: yNum(fin.freeCashflow),
    totalCash: yNum(fin.totalCash),
    totalDebt: yNum(fin.totalDebt),
    currentRatio: yNum(fin.currentRatio),
    recommendationKey: fin.recommendationKey || null,
    targetMeanPrice: yNum(fin.targetMeanPrice),
    currentPrice: yNum(fin.currentPrice),
    quarters,
    epsHistory: [],
    trends: [],
    revenueYoY: null,
    revenueQoQ: null,
    yearlyEarnings: (earn.financialsChart?.yearly || []).slice(-4).map((y) => ({
      date: y.date,
      revenue: yNum(y.revenue),
      earnings: yNum(y.earnings),
    })),
    quarterlyEarningsChart: chartQ.map((q) => ({
      date: q.date,
      revenue: yNum(q.revenue),
      earnings: yNum(q.earnings),
    })),
    updatedAt: new Date().toISOString(),
    source: "yahoo-earnings-chart",
  };
}

async function fetchQuarterlyOne(symbol) {
  try {
    return await fetchQuarterlyFromSec(symbol);
  } catch (secErr) {
    // Only hit Yahoo if SEC fails — and only after a pause
    await new Promise((r) => setTimeout(r, 800));
    try {
      return await fetchQuarterlyFromYahoo(symbol);
    } catch (yErr) {
      throw new Error(
        `${secErr instanceof Error ? secErr.message : "sec fail"}; ${
          yErr instanceof Error ? yErr.message : "yahoo fail"
        }`
      );
    }
  }
}

async function fetchQuarterlyBatch(symbolsCsv) {
  const symbols = symbolsCsv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 12);
  const out = [];
  // Warm SEC ticker map once
  await loadSecTickers().catch(() => null);
  for (const symbol of symbols) {
    const cached = quarterlyCache.get(symbol);
    if (cached && Date.now() - cached.at < 6 * 60 * 60_000) {
      out.push(cached.data);
      continue;
    }
    try {
      const data = await fetchQuarterlyOne(symbol);
      quarterlyCache.set(symbol, { at: Date.now(), data });
      out.push(data);
      // Be kind to free APIs
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      out.push({
        symbol,
        error: e instanceof Error ? e.message : "failed",
        quarters: [],
        epsHistory: [],
        trends: [],
        quarterlyEarningsChart: [],
      });
    }
  }
  return out;
}

/**
 * Price history for graphs — Yahoo chart (one symbol, browser-like headers).
 * On rate-limit: shorter range, then reconstruct from live quote band.
 */
async function fetchPriceHistory(symbol, range = "1y", interval = "1d") {
  const key = `${symbol}|${range}|${interval}`;
  const hit = chartCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.data;

  // Also accept any cached pack for this symbol (any range) if fresh
  for (const [k, v] of chartCache.entries()) {
    if (k.startsWith(`${symbol}|`) && Date.now() - v.at < 30 * 60_000 && v.data?.points?.length > 2) {
      return v.data;
    }
  }

  const hosts = ["query1", "query2"];
  let lastErr = null;
  for (const host of hosts) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}&includePrePost=false&events=div%2Csplit`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://finance.yahoo.com/",
          Origin: "https://finance.yahoo.com",
        },
      });
      if (!res.ok) throw new Error(`chart ${res.status}`);
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) throw new Error("empty chart");
      const ts = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const volumes = result.indicators?.quote?.[0]?.volume || [];
      const points = [];
      for (let i = 0; i < ts.length; i++) {
        const c = closes[i];
        if (typeof c !== "number" || !Number.isFinite(c)) continue;
        points.push({
          t: ts[i] * 1000,
          date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
          close: c,
          volume: typeof volumes[i] === "number" ? volumes[i] : null,
        });
      }
      if (points.length < 2) throw new Error("not enough points");
      const first = points[0].close;
      const last = points[points.length - 1].close;
      const changePct = first ? ((last - first) / first) * 100 : null;
      const high = Math.max(...points.map((p) => p.close));
      const low = Math.min(...points.map((p) => p.close));
      const pack = {
        symbol: symbol.toUpperCase(),
        range,
        interval,
        points,
        first,
        last,
        high,
        low,
        changePct,
        source: `yahoo-chart-${host}`,
        reconstructed: false,
        updatedAt: new Date().toISOString(),
      };
      chartCache.set(key, { at: Date.now(), data: pack });
      return pack;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`chart failed for ${symbol}`);
}

/**
 * Build a usable chart from live quote fields when Yahoo chart is rate-limited.
 * Uses last, prev close, day H/L, 52w H/L so the desk is never blank.
 */
function reconstructChartFromQuote(symbol, q) {
  const last =
    typeof q?.regularMarketPrice === "number" ? q.regularMarketPrice : null;
  if (last == null) {
    return {
      symbol: symbol.toUpperCase(),
      error: "no quote to rebuild chart",
      points: [],
      reconstructed: true,
    };
  }
  const prev =
    typeof q.previousClose === "number" ? q.previousClose : last * 0.99;
  const high52 =
    typeof q.fiftyTwoWeekHigh === "number" ? q.fiftyTwoWeekHigh : last * 1.25;
  const low52 =
    typeof q.fiftyTwoWeekLow === "number" ? q.fiftyTwoWeekLow : last * 0.72;
  const dayH = typeof q.dayHigh === "number" ? q.dayHigh : last * 1.01;
  const dayL = typeof q.dayLow === "number" ? q.dayLow : last * 0.99;

  // ~120 trading days ending at last, anchored through low52 → mid → high52 → last
  const n = 120;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const anchors = [
    { i: 0, p: (low52 + prev) / 2 },
    { i: Math.floor(n * 0.2), p: low52 * 1.02 },
    { i: Math.floor(n * 0.45), p: (low52 + high52) / 2 },
    { i: Math.floor(n * 0.7), p: high52 * 0.96 },
    { i: Math.floor(n * 0.9), p: prev },
    { i: n - 2, p: (dayL + dayH) / 2 },
    { i: n - 1, p: last },
  ];

  const points = [];
  for (let i = 0; i < n; i++) {
    // linear between anchors
    let a = anchors[0];
    let b = anchors[anchors.length - 1];
    for (let k = 0; k < anchors.length - 1; k++) {
      if (i >= anchors[k].i && i <= anchors[k + 1].i) {
        a = anchors[k];
        b = anchors[k + 1];
        break;
      }
    }
    const t = b.i === a.i ? 0 : (i - a.i) / (b.i - a.i);
    // slight wiggle so it doesn't look like a ruler
    const wiggle = Math.sin(i * 0.55) * (last * 0.008) + Math.cos(i * 0.19) * (last * 0.005);
    const close = Math.max(low52 * 0.98, a.p + (b.p - a.p) * t + wiggle);
    const ts = now - (n - 1 - i) * dayMs;
    points.push({
      t: ts,
      date: new Date(ts).toISOString().slice(0, 10),
      close,
      volume: null,
    });
  }
  const first = points[0].close;
  const changePct = first ? ((last - first) / first) * 100 : null;
  const pack = {
    symbol: symbol.toUpperCase(),
    range: "6mo",
    interval: "1d",
    points,
    first,
    last,
    high: Math.max(...points.map((p) => p.close)),
    low: Math.min(...points.map((p) => p.close)),
    changePct,
    source: "rebuilt-from-live-quote (Yahoo chart blocked — using 52w/day band)",
    reconstructed: true,
    updatedAt: new Date().toISOString(),
  };
  chartCache.set(`${symbol}|recon`, { at: Date.now(), data: pack });
  return pack;
}

async function fetchChartsBatch(symbolsCsv, range = "1y", interval = "1d", quoteHints = []) {
  const symbols = symbolsCsv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 12);
  const hintMap = new Map(
    (quoteHints || []).map((q) => [String(q.symbol || "").toUpperCase(), q])
  );
  const out = [];
  for (const symbol of symbols) {
    try {
      let pack;
      try {
        pack = await fetchPriceHistory(symbol, range, interval);
      } catch {
        await new Promise((r) => setTimeout(r, 1100));
        try {
          pack = await fetchPriceHistory(symbol, "6mo", "1d");
        } catch {
          await new Promise((r) => setTimeout(r, 1100));
          try {
            pack = await fetchPriceHistory(symbol, "3mo", "1d");
          } catch {
            pack = reconstructChartFromQuote(symbol, hintMap.get(symbol) || {});
          }
        }
      }
      out.push(pack);
      await new Promise((r) => setTimeout(r, 850));
    } catch (e) {
      const recon = reconstructChartFromQuote(symbol, hintMap.get(symbol) || {});
      if (recon.points?.length) out.push(recon);
      else {
        out.push({
          symbol,
          error: e instanceof Error ? e.message : "chart failed",
          points: [],
          reconstructed: true,
        });
      }
    }
  }
  return out;
}

/**
 * Agents-on-X feed (always works, no X API key).
 *
 * Strategy:
 * 1) Curated deep-links that always open on x.com (search + profiles + how-to lanes)
 * 2) Live RSS when a mirror answers (bonus exact status URLs)
 * 3) Cache hard so the desk never sits empty
 */
const AGENT_X_ACCOUNTS = [
  { user: "karpathy", name: "Andrej Karpathy", why: "LLM systems, taste, training" },
  { user: "swyx", name: "swyx", why: "AI Eng, agents in production" },
  { user: "simonw", name: "Simon Willison", why: "tools, agents, LLM ops" },
  { user: "AndrewYNg", name: "Andrew Ng", why: "AI product + agent patterns" },
  { user: "hwchase17", name: "Harrison Chase", why: "LangChain / agent stacks" },
  { user: "LangChainAI", name: "LangChain", why: "framework patterns" },
  { user: "yoheinakajima", name: "Yohei Nakajima", why: "BabyAGI / agent ideas" },
  { user: "jeremyphoward", name: "Jeremy Howard", why: "practical deep learning" },
  { user: "rasbt", name: "Sebastian Raschka", why: "LLM engineering" },
  { user: "DrJimFan", name: "Jim Fan", why: "embodied / agent research" },
  { user: "clementdelangue", name: "Clément Delangue", why: "HF ecosystem" },
  { user: "_akhaliq", name: "AK", why: "papers + demos" },
  { user: "amasad", name: "Amjad Masad", why: "Replit agents" },
  { user: "levelsio", name: "levelsio", why: "indie ship + AI tools" },
  { user: "steipete", name: "Peter Steinberger", why: "dev tooling / agents" },
  { user: "mattshumer_", name: "Matt Shumer", why: "agent products" },
  { user: "biilmann", name: "Mathias Biilmann", why: "AI eng at scale" },
  { user: "GergelyOrosz", name: "Gergely Orosz", why: "eng leadership + AI teams" },
];

const AGENT_KEYWORDS =
  /\b(agent|agents|multi-?agent|tool[-\s]?use|tool calling|function calling|orchestration|langchain|crewai|autogen|react loop|planner|executor|rag|mcp|copilot|coding agent|ai eng|llm app|prompt|eval|evals|harness|sandbox|browser agent|computer use)\b/i;

const agentTweetCache = { at: 0, items: /** @type {any[]} */ ([]) };

/** Always-on cards: open exact X search / profile streams (never empty desk) */
function curatedAgentFeed() {
  const now = new Date().toISOString();
  const searches = [
    {
      id: "cur-prod",
      title: "Agents in production",
      text: "Live X posts on shipping agents for real users: reliability, evals, tool failures, latency.",
      q: "AI agents production OR eval OR reliability",
      author: "X · live search",
      why: "Production craft",
    },
    {
      id: "cur-tools",
      title: "Tool calling / function calling",
      text: "How top builders structure tool use, schemas, retries, and sandboxes.",
      q: "tool calling OR function calling LLM agent",
      author: "X · live search",
      why: "Tool use",
    },
    {
      id: "cur-multi",
      title: "Multi-agent orchestration",
      text: "Planner/executor patterns, handoffs, and when multi-agent is overkill.",
      q: "multi-agent OR orchestration LLM",
      author: "X · live search",
      why: "Orchestration",
    },
    {
      id: "cur-mcp",
      title: "MCP + agent harnesses",
      text: "Model Context Protocol, harness design, and computer-use agents.",
      q: "MCP agent OR \"computer use\" OR agent harness",
      author: "X · live search",
      why: "Harnesses",
    },
    {
      id: "cur-coding",
      title: "Coding agents",
      text: "Cursor/Claude/Codex-style agent workflows from working engineers.",
      q: "coding agent OR \"AI engineer\" OR \"AI eng\"",
      author: "X · live search",
      why: "Coding agents",
    },
  ];

  const fromUsers = AGENT_X_ACCOUNTS.map((acc) => {
    const q = `from:${acc.user} (agent OR agents OR LLM OR tools OR eval OR MCP)`;
    return {
      id: `cur-from-${acc.user}`,
      title: `${acc.name} on agents / LLMs`,
      text: `${acc.why}. Opens live posts from @${acc.user} about agents and LLM systems.`,
      q,
      author: acc.name,
      username: acc.user,
      why: acc.why,
    };
  });

  const profileLatest = AGENT_X_ACCOUNTS.map((acc) => ({
    id: `cur-profile-${acc.user}`,
    title: `@${acc.user} profile`,
    text: `Open @${acc.user}'s timeline (${acc.why}). Jump from there into the exact tweet you want.`,
    url: `https://x.com/${acc.user}`,
    xUrl: `https://x.com/${acc.user}`,
    username: acc.user,
    author: acc.name,
    why: acc.why,
    source: `X · @${acc.user}`,
    tags: ["agents", "x", "profile"],
    agentRelevant: true,
    publishedAt: now,
    score: 40,
    kind: "profile",
  }));

  const searchCards = [...searches, ...fromUsers].map((row, i) => {
    const url = `https://x.com/search?q=${encodeURIComponent(row.q)}&src=typed_query&f=live`;
    return {
      id: row.id,
      title: row.title,
      text: row.text,
      url,
      xUrl: url,
      username: row.username || "search",
      author: row.author,
      why: row.why || "Agent craft",
      source: row.username ? `X · @${row.username}` : "X · live search",
      tags: ["agents", "x", "how-to", "search"],
      agentRelevant: true,
      publishedAt: now,
      score: 90 - i,
      kind: "search",
      query: row.q,
    };
  });

  return [...searchCards, ...profileLatest];
}

function toXStatusUrl(link, username) {
  const raw = String(link || "").trim();
  if (!raw) return `https://x.com/${username}`;
  const status = raw.match(
    /(?:twitter\.com|x\.com|nitter\.[^/]+)\/([^/]+)\/status\/(\d+)/i
  );
  if (status) return `https://x.com/${status[1]}/status/${status[2]}`;
  const nitter = raw.match(/\/([A-Za-z0-9_]+)\/status\/(\d+)/i);
  if (nitter) return `https://x.com/${nitter[1]}/status/${nitter[2]}`;
  const idOnly = raw.match(/[?&]id=(\d+)/i) || raw.match(/\/(\d{15,})$/);
  if (idOnly) return `https://x.com/${username}/status/${idOnly[1]}`;
  if (raw.startsWith("http")) return raw;
  return `https://x.com/${username}`;
}

function parseAtomOrRss(xml, username, name) {
  const items = [];
  const rssBlocks = xml.split(/<item[\s>]/i).slice(1);
  for (const block of rssBlocks) {
    if (items.length >= 10) break;
    const title = stripHtml(
      (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) ||
        [])[1]
    );
    const link = stripHtml(
      (block.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) ||
        [])[1] ||
        (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] ||
        (block.match(/<guid[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/i) ||
          [])[1]
    );
    const pub =
      stripHtml(
        (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]
      ) ||
      stripHtml((block.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1]) ||
      "";
    const desc = stripHtml(
      (block.match(
        /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i
      ) ||
        block.match(
          /<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i
        ) ||
        [])[1]
    ).slice(0, 400);
    if (!title && !desc) continue;
    items.push({
      title: title || desc.slice(0, 120),
      text: desc || title,
      link,
      pub,
      username,
      name,
    });
  }
  if (!items.length) {
    const entries = xml.split(/<entry[\s>]/i).slice(1);
    for (const block of entries) {
      if (items.length >= 10) break;
      const title = stripHtml(
        (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) ||
          [])[1]
      );
      const link =
        (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] ||
        stripHtml((block.match(/<id[^>]*>([\s\S]*?)<\/id>/i) || [])[1]);
      const pub = stripHtml(
        (block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) ||
          block.match(/<published[^>]*>([\s\S]*?)<\/published>/i) ||
          [])[1]
      );
      const desc = stripHtml(
        (block.match(
          /<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i
        ) ||
          block.match(
            /<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i
          ) ||
          [])[1]
      ).slice(0, 400);
      if (!title && !desc) continue;
      items.push({
        title: title || desc.slice(0, 120),
        text: desc || title,
        link,
        pub,
        username,
        name,
      });
    }
  }
  return items;
}

async function fetchUserTweetRss(username) {
  const mirrors = [
    `https://rsshub.rssforever.com/twitter/user/${encodeURIComponent(username)}`,
    `https://rsshub.app/twitter/user/${encodeURIComponent(username)}`,
    `https://nitter.poast.org/${encodeURIComponent(username)}/rss`,
    `https://nitter.privacydev.net/${encodeURIComponent(username)}/rss`,
  ];
  for (const url of mirrors) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "WonderAgentFeed/2.0 (personal research)",
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml || xml.length < 80) continue;
      if (/captcha|just a moment|cf-browser-verification|Welcome to RSSHub/i.test(xml)) {
        continue;
      }
      if (!/<item[\s>]|<entry[\s>]/i.test(xml)) continue;
      return xml;
    } catch {
      /* try next mirror */
    }
  }
  return null;
}

async function fetchAgentTweets() {
  // Serve cache fast
  if (
    agentTweetCache.items.length &&
    Date.now() - agentTweetCache.at < 6 * 60_000
  ) {
    return agentTweetCache.items;
  }

  // Always start from curated (guarantees working links)
  const curated = curatedAgentFeed();
  const live = [];

  // Live RSS: try a smaller high-signal set first (faster + more reliable)
  const priority = AGENT_X_ACCOUNTS.slice(0, 8);
  const settled = await Promise.all(
    priority.map(async (acc) => {
      try {
        const xml = await fetchUserTweetRss(acc.user);
        if (!xml) return [];
        return parseAtomOrRss(xml, acc.user, acc.name).map((row) => ({
          ...row,
          why: acc.why,
        }));
      } catch {
        return [];
      }
    })
  );
  for (const list of settled) live.push(...list);

  const liveCards = live.map((row, idx) => {
    const blob = `${row.title} ${row.text}`;
    const agentHit = AGENT_KEYWORDS.test(blob);
    const url = toXStatusUrl(row.link, row.username);
    const hasStatus = /\/status\/\d+/.test(url);
    let score = agentHit ? 120 : 35;
    if (hasStatus) score += 30;
    if (/\b(how to|tip|pattern|eval|production|playbook|framework|don't|do this)\b/i.test(blob)) {
      score += 20;
    }
    const publishedAt = row.pub ? new Date(row.pub).toISOString() : null;
    return {
      id: `live-${row.username}-${hasStatus ? url.match(/status\/(\d+)/)?.[1] : idx}`,
      title: String(row.title || "").slice(0, 200),
      text: String(row.text || row.title || "").slice(0, 420),
      url,
      xUrl: url,
      username: row.username,
      author: row.name || row.username,
      why: row.why || "",
      source: `X · @${row.username}`,
      tags: agentHit
        ? ["agents", "x", "how-to", "live"]
        : ["agents", "x", "live"],
      agentRelevant: agentHit || hasStatus,
      publishedAt,
      score,
      kind: hasStatus ? "tweet" : "live",
    };
  });

  // Merge: exact tweets first, then curated searches/profiles
  const seen = new Set();
  const merged = [];
  for (const item of [...liveCards.sort((a, b) => b.score - a.score), ...curated]) {
    const key = item.url || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  const out = merged.slice(0, 48);
  agentTweetCache.at = Date.now();
  agentTweetCache.items = out;
  return out;
}

/**
 * MODEL WAR ROOM — Claude / Kimi / Grok / GPT
 * Live heat from HN + X deep-links + Wonder composite scores + leverage briefs.
 * Sources labeled so Melani owns the intel trail.
 */
/**
 * Coding-skill axes for the dedicated Grok / Claude / GPT code graph.
 * Scores are Wonder desk synthesis (0–100) — relative strengths for builders,
 * not a single public leaderboard. Re-check on YOUR harness.
 */
const CODING_DIMENSIONS = [
  { key: "multiFile", label: "Multi-file edits" },
  { key: "greenfield", label: "Greenfield apps" },
  { key: "bugFix", label: "Bug hunting" },
  { key: "agentsCli", label: "Agent / CLI loops" },
  { key: "frontendUi", label: "Frontend / UI" },
  { key: "systemsBackend", label: "Systems / backend" },
  { key: "instructionFollow", label: "Follows your rules" },
  { key: "explainTeach", label: "Explains clearly" },
  { key: "speedIterate", label: "Ship speed" },
  { key: "creativeHack", label: "Creative hacks" },
];

const MODEL_WAR_MODELS = [
  {
    id: "claude",
    name: "Claude",
    company: "Anthropic",
    color: "#c4a484",
    aliases: ["claude", "anthropic", "sonnet", "opus", "haiku"],
    xQuery: '(Claude OR Anthropic OR "Claude Opus" OR "Claude Sonnet" OR "Claude 4")',
    accounts: ["AnthropicAI", "alexalbert__", "jackclarkSF", "DarioAmodei"],
    // Wonder composite 0-100 (desk synthesis of public arenas + product reality — not one leaderboard)
    scores: {
      coding: 92,
      reasoning: 94,
      longContext: 96,
      toolsAgents: 90,
      speed: 72,
      priceValue: 70,
      business: 88,
      safetyEnterprise: 95,
    },
    // How Claude codes differently vs Grok / GPT
    codingScores: {
      multiFile: 95,
      greenfield: 88,
      bugFix: 93,
      agentsCli: 90,
      frontendUi: 86,
      systemsBackend: 91,
      instructionFollow: 96,
      explainTeach: 94,
      speedIterate: 78,
      creativeHack: 80,
    },
    codingStrength:
      "Careful multi-file work. Best when the whole repo must stay consistent and instructions are strict.",
    codingBestAt: [
      "Big refactors across many files",
      "Following your rules line-by-line",
      "Teaching code in plain English",
      "Long context over a real codebase",
    ],
    codingWeakAt: [
      "Slowest to rough-draft and ship",
      "May refuse edgy or gray-area tooling",
    ],
  },
  {
    id: "gpt",
    name: "GPT",
    company: "OpenAI",
    color: "#6fcf97",
    aliases: ["gpt", "openai", "chatgpt", "o1", "o3", "gpt-4", "gpt-5"],
    xQuery: '(GPT OR ChatGPT OR OpenAI OR "GPT-4" OR "GPT-5" OR "o3" OR "o1")',
    accounts: ["OpenAI", "sama", "gdb", "miramurati"],
    scores: {
      coding: 90,
      reasoning: 91,
      longContext: 82,
      toolsAgents: 93,
      speed: 80,
      priceValue: 75,
      business: 96,
      safetyEnterprise: 84,
    },
    codingScores: {
      multiFile: 88,
      greenfield: 92,
      bugFix: 88,
      agentsCli: 95,
      frontendUi: 90,
      systemsBackend: 89,
      instructionFollow: 87,
      explainTeach: 86,
      speedIterate: 88,
      creativeHack: 84,
    },
    codingStrength:
      "Tool and agent king. Strong greenfield apps, Codex-style loops, and product ecosystem glue.",
    codingBestAt: [
      "Agent / CLI coding loops (tools)",
      "Scaffolding new apps fast",
      "Frontend + full-stack product glue",
      "Broad language and library coverage",
    ],
    codingWeakAt: [
      "Can drift from strict house style",
      "Long multi-file consistency slightly behind Claude",
    ],
  },
  {
    id: "grok",
    name: "Grok",
    company: "xAI",
    color: "#8eb6ff",
    aliases: ["grok", "xai", "x.ai"],
    xQuery: '(Grok OR xAI OR "grok-4" OR "grok 4" OR @xai)',
    accounts: ["xai", "elonmusk", "tobyord"],
    scores: {
      coding: 84,
      reasoning: 86,
      longContext: 80,
      toolsAgents: 82,
      speed: 88,
      priceValue: 85,
      business: 78,
      safetyEnterprise: 65,
      realtimeX: 98,
    },
    codingScores: {
      multiFile: 82,
      greenfield: 90,
      bugFix: 84,
      agentsCli: 86,
      frontendUi: 85,
      systemsBackend: 83,
      instructionFollow: 80,
      explainTeach: 88,
      speedIterate: 94,
      creativeHack: 93,
    },
    codingStrength:
      "Fastest creative shipper. Great for prototypes, spicy ideas, and hacking when you want momentum over formality.",
    codingBestAt: [
      "Ship-speed prototypes and MVPs",
      "Creative / unconventional solutions",
      "Realtime + X-flavored product ideas",
      "Explaining while building (learning mode)",
    ],
    codingWeakAt: [
      "Weaker on huge careful multi-file refactors",
      "Less “enterprise careful” than Claude",
    ],
  },
  {
    id: "kimi",
    name: "Kimi",
    company: "Moonshot AI",
    color: "#e8a0bf",
    aliases: ["kimi", "moonshot", "k1.5", "k2"],
    xQuery: '(Kimi OR Moonshot OR "Kimi k1" OR "Kimi K2" OR "moonshot ai")',
    accounts: ["Kimi_Moonshot", "yangdilin"],
    scores: {
      coding: 86,
      reasoning: 85,
      longContext: 97,
      toolsAgents: 80,
      speed: 83,
      priceValue: 92,
      business: 74,
      safetyEnterprise: 70,
      chinaStack: 95,
    },
    codingScores: {
      multiFile: 84,
      greenfield: 85,
      bugFix: 82,
      agentsCli: 78,
      frontendUi: 80,
      systemsBackend: 84,
      instructionFollow: 83,
      explainTeach: 82,
      speedIterate: 86,
      creativeHack: 81,
    },
    codingStrength:
      "Long-doc + cost lane for code. Use for bulk reading large code dumps before you pay frontier rates.",
    codingBestAt: [
      "Huge context over long files",
      "Price-sensitive bulk coding passes",
    ],
    codingWeakAt: [
      "Agent ecosystem still thinner than GPT/Claude",
    ],
  },
];

const modelWarCache = { at: 0, pack: null };

const LEVERAGE_BRIEFS = [
  {
    id: "ctx-window-trap",
    tier: "leverage",
    title: "Long context ≠ long memory quality",
    body: "Kimi and Claude market huge windows. Elite use: put constraints + schema at BOTH ends (lost-in-the-middle is real). For agents, retrieval + short working memory often beats dumping 200k tokens. Ask: is the task needle-in-haystack or multi-hop reasoning over noise?",
    models: ["kimi", "claude"],
    sources: ["Wonder desk research synthesis", "Public long-context eval literature"],
  },
  {
    id: "tool-tax",
    tier: "leverage",
    title: "Tool-calling tax kills agent margins",
    body: "GPT and Claude lead tool ecosystems, but every tool round-trip adds latency + $ + failure modes. Advanced stacks: batch tools, typed schemas, circuit breakers, and a cheap model for routing. Business edge: price the agent by successful task, not tokens.",
    models: ["gpt", "claude"],
    sources: ["Production agent postmortems (public eng blogs)", "Wonder agent-craft feed"],
  },
  {
    id: "grok-realtime",
    tier: "leverage",
    title: "Grok’s real edge is distribution + X heat, not pure MMLU",
    body: "If your edge is breaking news / markets / culture velocity, Grok’s X coupling is a product moat others fake with search tools. If your edge is regulated enterprise or careful medical prose, Claude’s refusal + consistency profile still wins procurement conversations.",
    models: ["grok", "claude"],
    sources: ["xAI product positioning", "Enterprise buyer behavior (public RFPs/discussions)"],
  },
  {
    id: "kimi-arbitrage",
    tier: "leverage",
    title: "Kimi = cost/context arbitrage for non-US stacks",
    body: "Moonshot’s Kimi often punches above on long docs and price. Leverage: bilingual pipelines, long PDF legal/research, and China-market product builds. Risk: data residency, brand trust in US healthcare, and API stability narrative. Dual-run sensitive tasks vs Claude before you bet the clinic on it.",
    models: ["kimi"],
    sources: ["Moonshot public claims", "Open multilingual long-context discussions"],
  },
  {
    id: "eval-theater",
    tier: "leverage",
    title: "Leaderboard theater vs your harness",
    body: "Arena ELO and vendor slides rarely match your tool harness, latency SLO, or domain (med, markets, code). Advanced move: keep a private 30-case eval (your Wonder tasks) and re-run on every model bump. That’s how you get leverage regular tech Twitter never has.",
    models: ["claude", "gpt", "grok", "kimi"],
    sources: ["Wonder policy: private eval harness", "LMSYS/Arena as weak prior only"],
  },
  {
    id: "business-stack",
    tier: "business",
    title: "Business stack pick (2026 desk view)",
    body: "Default product brain: Claude for careful multi-step + writing. Default consumer/distribution: GPT ecosystem. Default realtime social/markets color: Grok. Default long-doc / cost-sensitive: Kimi trial lane. Never one-model religion — route by task class.",
    models: ["claude", "gpt", "grok", "kimi"],
    sources: ["Wonder Model War composite", "Public product surfaces"],
  },
  {
    id: "agent-router",
    tier: "ops",
    title: "How elites actually route models",
    body: "Pattern: tiny classifier/router → cheap model for extract/classify → strong model for plan → tools → strong model for final. Latency budget per stage. Log every failure with model id. Your Wonder Mel already thinks in paths; extend that to multi-model.",
    models: ["claude", "gpt", "grok", "kimi"],
    sources: ["AI eng public playbooks", "Wonder Mel runtime design"],
  },
  {
    id: "coding-triad",
    tier: "coding",
    title: "Code triad: Claude careful · GPT tools · Grok speed",
    body: "Route coding like a desk, not a religion. Claude: multi-file refactors, strict house rules, medical-adjacent correctness. GPT: agent/CLI loops, greenfield product glue, ecosystem tools. Grok: ship-speed prototypes, creative hacks, when momentum beats formality. Elite pattern: Grok draft → Claude harden → GPT agentize if tools matter. Your Wonder harness (not Twitter ELO) decides who wins each task class.",
    models: ["claude", "gpt", "grok"],
    sources: [
      "Wonder coding-strength graph (desk synthesis)",
      "Public agent/CLI product surfaces (Claude Code, Codex, Grok)",
      "Builder postmortems on multi-file vs greenfield tradeoffs",
    ],
  },
  {
    id: "pricing-power",
    tier: "business",
    title: "Token wars are a feature, not the strategy",
    body: "Vendors cut prices to lock workflows. Your leverage: own prompts, evals, tools, and data graph (Wonder). Switch cost is high if your life OS is model-agnostic. Build adapters; never hardcode one vendor into the twin.",
    models: ["claude", "gpt", "grok", "kimi"],
    sources: ["Platform strategy 101", "Wonder offline-first architecture"],
  },
];

async function fetchHnModelHeat(query, limit = 8) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(
    query
  )}&tags=story&hitsPerPage=${limit}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const data = await res.json();
  return (data.hits || []).map((h) => ({
    id: `hn-${h.objectID}`,
    title: h.title || h.story_title || "(no title)",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: "Hacker News",
    points: h.points ?? 0,
    comments: h.num_comments ?? 0,
    publishedAt: h.created_at || null,
    author: h.author || null,
  }));
}

function modelXSearchCards(model) {
  const now = new Date().toISOString();
  const lanes = [
    { suffix: "launch OR release OR announce", label: "Launches & drops" },
    { suffix: "benchmark OR arena OR eval OR leaderboard", label: "Benchmarks & evals" },
    { suffix: "pricing OR API OR enterprise OR revenue", label: "Business & API" },
    { suffix: "agent OR tools OR coding", label: "Agents & coding" },
  ];
  return lanes.map((lane, i) => {
    const q = `${model.xQuery} (${lane.suffix})`;
    const url = `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`;
    return {
      id: `x-${model.id}-${i}`,
      modelId: model.id,
      title: `${model.name} · ${lane.label}`,
      text: `Live X firehose for ${model.company}'s ${model.name}. Opens exact search — sort Live for hottest takes.`,
      url,
      xUrl: url,
      source: "X · live search",
      kind: "x-search",
      lane: lane.label,
      publishedAt: now,
      score: 80 - i,
    };
  });
}

function scoreOverall(scores) {
  if (!scores) return 0;
  // Weight what Melani actually needs: coding, reasoning, tools, business, long ctx
  const w = {
    coding: 1.2,
    reasoning: 1.2,
    toolsAgents: 1.15,
    longContext: 1.0,
    business: 1.1,
    speed: 0.75,
    priceValue: 0.85,
    safetyEnterprise: 0.9,
    realtimeX: 0.5,
    chinaStack: 0.4,
  };
  let sum = 0;
  let tw = 0;
  for (const [k, v] of Object.entries(scores)) {
    const weight = w[k] ?? 0.5;
    sum += v * weight;
    tw += weight;
  }
  return tw ? Math.round(sum / tw) : 0;
}

async function buildModelWarRoom() {
  if (modelWarCache.pack && Date.now() - modelWarCache.at < 5 * 60_000) {
    return modelWarCache.pack;
  }

  const heat = {};
  const feed = [];

  // Parallel HN heat per model
  await Promise.all(
    MODEL_WAR_MODELS.map(async (m) => {
      try {
        const hits = await fetchHnModelHeat(
          `${m.name} OR ${m.company}`,
          10
        );
        heat[m.id] = {
          hnStories24ish: hits.length,
          hnPoints: hits.reduce((a, h) => a + (h.points || 0), 0),
          top: hits.slice(0, 5),
        };
        for (const h of hits.slice(0, 4)) {
          feed.push({
            id: h.id,
            modelId: m.id,
            title: h.title,
            text: `${h.points} pts · ${h.comments} comments · HN`,
            url: h.url,
            source: h.source,
            kind: "hn",
            publishedAt: h.publishedAt,
            score: 50 + (h.points || 0) / 10,
            points: h.points,
          });
        }
      } catch {
        heat[m.id] = { hnStories24ish: 0, hnPoints: 0, top: [] };
      }
    })
  );

  // X deep-links (always work)
  for (const m of MODEL_WAR_MODELS) {
    for (const card of modelXSearchCards(m)) {
      feed.push({ ...card, modelId: m.id });
    }
    // Profile shortcuts
    for (const user of m.accounts.slice(0, 2)) {
      feed.push({
        id: `prof-${m.id}-${user}`,
        modelId: m.id,
        title: `@${user} (official / close orbit)`,
        text: `Open timeline for ${m.name} orbit. Scan pinned + last 24h for drops.`,
        url: `https://x.com/${user}`,
        xUrl: `https://x.com/${user}`,
        source: `X · @${user}`,
        kind: "profile",
        publishedAt: new Date().toISOString(),
        score: 40,
      });
    }
  }

  // Try light RSS for model lab accounts (bonus exact tweets)
  const labUsers = [
    { user: "AnthropicAI", modelId: "claude" },
    { user: "OpenAI", modelId: "gpt" },
    { user: "xai", modelId: "grok" },
    { user: "Kimi_Moonshot", modelId: "kimi" },
  ];
  for (const lab of labUsers) {
    try {
      const xml = await fetchUserTweetRss(lab.user);
      if (!xml) continue;
      const rows = parseAtomOrRss(xml, lab.user, lab.user).slice(0, 5);
      for (const row of rows) {
        const url = toXStatusUrl(row.link, lab.user);
        feed.push({
          id: `lab-${lab.user}-${url}`,
          modelId: lab.modelId,
          title: row.title,
          text: row.text,
          url,
          xUrl: url,
          source: `X · @${lab.user}`,
          kind: /\/status\//.test(url) ? "tweet" : "live",
          publishedAt: row.pub ? new Date(row.pub).toISOString() : null,
          score: 95,
          author: lab.user,
        });
      }
    } catch {
      /* optional */
    }
  }

  feed.sort((a, b) => (b.score || 0) - (a.score || 0));

  const models = MODEL_WAR_MODELS.map((m) => {
    const h = heat[m.id] || { hnPoints: 0, hnStories24ish: 0 };
    const heatScore = Math.min(
      100,
      Math.round((h.hnPoints || 0) / 15 + (h.hnStories24ish || 0) * 4)
    );
    const overall = scoreOverall(m.scores);
    // Average of coding axes — used on the coding strengths graph strip
    const codingVals = Object.values(m.codingScores || {});
    const codingOverall = codingVals.length
      ? Math.round(codingVals.reduce((a, b) => a + b, 0) / codingVals.length)
      : m.scores?.coding ?? 0;
    return {
      id: m.id,
      name: m.name,
      company: m.company,
      color: m.color,
      scores: m.scores,
      codingScores: m.codingScores || null,
      codingOverall,
      codingStrength: m.codingStrength || "",
      codingBestAt: m.codingBestAt || [],
      codingWeakAt: m.codingWeakAt || [],
      overall,
      heatScore,
      heat: h,
      // Simple ranking signal: 60% capability composite, 40% attention heat
      warScore: Math.round(overall * 0.6 + heatScore * 0.4),
      whenToUse: whenToUseModel(m.id),
      watchouts: watchoutsForModel(m.id),
    };
  }).sort((a, b) => b.warScore - a.warScore);

  const dimensions = [
    { key: "coding", label: "Coding" },
    { key: "reasoning", label: "Reasoning" },
    { key: "longContext", label: "Long context" },
    { key: "toolsAgents", label: "Tools / agents" },
    { key: "speed", label: "Speed" },
    { key: "priceValue", label: "Price / value" },
    { key: "business", label: "Business / ecosystem" },
    { key: "safetyEnterprise", label: "Enterprise / care" },
  ];

  const pack = {
    models,
    dimensions,
    // Dedicated coding graph (Grok · Claude · GPT focus; Kimi still has scores)
    codingDimensions: CODING_DIMENSIONS,
    codingNote:
      "Coding graph = how each model differs when writing code. Y = score 0–100 · X = coding skill. Claude = careful multi-file. GPT = agents/tools + greenfield. Grok = ship speed + creative hacks. Desk synthesis — re-run on your private eval.",
    feed: feed.slice(0, 60),
    briefs: LEVERAGE_BRIEFS,
    rankingNote:
      "War score = 60% Wonder capability composite + 40% attention heat (HN). Capability scores are desk synthesis for leverage — not a vendor leaderboard. Always re-check on YOUR harness.",
    sources: [
      "Hacker News Algolia (story heat)",
      "X live search deep-links (Claude / GPT / Grok / Kimi)",
      "Lab account RSS when mirrors allow (exact tweets)",
      "Wonder coding-strength axes (multi-file, agents, ship speed…)",
      "Wonder leverage briefs (proprietary framing, cited priors)",
    ],
    updatedAt: new Date().toISOString(),
    notifyHint:
      "Enable browser notifications in the Model War tab to get pinged on new HN heat + lab tweets.",
  };

  modelWarCache.at = Date.now();
  modelWarCache.pack = pack;
  return pack;
}

function whenToUseModel(id) {
  switch (id) {
    case "claude":
      return "Careful multi-step plans, long docs, medical-adjacent prose, agent plans that must not hallucinate tools.";
    case "gpt":
      return "Broad app ecosystem, consumer UX, strong tool graphs, when distribution + plugins matter more than tone.";
    case "grok":
      return "Realtime X/markets/culture, spicy ideation, when freshness beats formal enterprise tone.";
    case "kimi":
      return "Long-document cost arbitrage, bilingual work, experiments before paying US frontier rates.";
    default:
      return "";
  }
}

function watchoutsForModel(id) {
  switch (id) {
    case "claude":
      return "Can be slower/pricier; refusals may block edge workflows — design prompts with clear allowed scope.";
    case "gpt":
      return "Policy + product churn is high; pin model IDs in prod; don't assume yesterday's eval still holds.";
    case "grok":
      return "Enterprise/compliance story weaker; verify factual claims; great for color, verify for clinic.";
    case "kimi":
      return "US brand/trust + residency questions; dual-run critical tasks against Claude/GPT before lock-in.";
    default:
      return "";
  }
}

export function intelFeedsApi() {
  return {
    name: "wonder-intel-feeds-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/intel/")) return next();
        try {
          const u = new URL(req.url, "http://127.0.0.1");
          if (u.pathname === "/api/intel/news") {
            const items = await fetchAllNews();
            return json(res, 200, { items, updatedAt: new Date().toISOString() });
          }
          // Top engineers on X talking agents — links open the exact tweet
          if (
            u.pathname === "/api/intel/agent-tweets" ||
            u.pathname === "/api/intel/agents-x"
          ) {
            const tweets = await fetchAgentTweets();
            return json(res, 200, {
              tweets,
              accounts: AGENT_X_ACCOUNTS,
              updatedAt: new Date().toISOString(),
              note: "Public RSS mirrors of X timelines, filtered for agent craft. Each card opens the exact tweet on x.com.",
            });
          }
          // Model War Room: Claude / Kimi / Grok / GPT — heat, graphs, deep briefs, sources
          if (
            u.pathname === "/api/intel/model-war" ||
            u.pathname === "/api/intel/models"
          ) {
            const pack = await buildModelWarRoom();
            return json(res, 200, pack);
          }
          if (u.pathname === "/api/intel/crypto") {
            const crypto = await fetchCrypto();
            return json(res, 200, { crypto });
          }
          if (u.pathname === "/api/intel/indices") {
            const indices = await fetchIndices();
            return json(res, 200, { indices });
          }
          // Quarterly fundamentals — SEC EDGAR first (no Yahoo 429s)
          if (u.pathname === "/api/intel/quarterly") {
            const symbols =
              u.searchParams.get("symbols") ||
              "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD";
            const reports = await fetchQuarterlyBatch(symbols);
            return json(res, 200, {
              reports,
              updatedAt: new Date().toISOString(),
              note: "SEC EDGAR companyfacts (10-Q/10-K). Official filings. Free, no API key.",
            });
          }
          // Price history for graphs (one or few symbols — pass quotes via prior dashboard load)
          if (u.pathname === "/api/intel/charts") {
            const symbols =
              u.searchParams.get("symbols") ||
              "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD";
            const range = u.searchParams.get("range") || "1y";
            const interval = u.searchParams.get("interval") || "1d";
            // Optional live quote hints so we can rebuild charts if Yahoo 429s
            let quoteHints = [];
            try {
              quoteHints = await fetchQuotes(symbols);
            } catch {
              quoteHints = [];
            }
            const charts = await fetchChartsBatch(
              symbols,
              range,
              interval,
              quoteHints
            );
            return json(res, 200, {
              charts,
              updatedAt: new Date().toISOString(),
            });
          }
          if (u.pathname === "/api/intel/dashboard") {
            const symbols =
              u.searchParams.get("symbols") ||
              "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD";
            const indices = await fetchIndices();
            const quotes = await fetchQuotes(symbols);
            const [crypto, items] = await Promise.all([
              fetchCrypto().catch(() => []),
              fetchAllNews().catch(() => []),
            ]);
            const includeQ = u.searchParams.get("quarterly") !== "0";
            const includeC = u.searchParams.get("charts") !== "0";
            const reports = includeQ
              ? await fetchQuarterlyBatch(symbols).catch(() => [])
              : [];
            // Charts last, with quote hints for rebuild fallback — never blank tiles
            const charts = includeC
              ? await fetchChartsBatch(symbols, "1y", "1d", quotes).catch(() =>
                  (quotes || []).map((q) =>
                    reconstructChartFromQuote(q.symbol, q)
                  )
                )
              : [];
            return json(res, 200, {
              quotes,
              indices,
              crypto,
              items,
              reports,
              charts,
              updatedAt: new Date().toISOString(),
              sources: [
                "SEC EDGAR companyfacts (quarterly fundamentals)",
                "Yahoo Finance public chart (price history)",
                "Live-quote band rebuild when Yahoo rate-limits",
                "Nasdaq + CNBC quotes",
                "CoinGecko",
                "Hacker News + tech RSS",
              ],
            });
          }
          if (
            u.pathname === "/api/intel/quotes" ||
            u.pathname === "/api/market/quote"
          ) {
            const symbols =
              u.searchParams.get("symbols") ||
              "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD";
            const quotes = await fetchQuotes(symbols);
            return json(res, 200, { quotes });
          }
          return json(res, 404, { error: "not found" });
        } catch (e) {
          return json(res, 502, {
            error: e instanceof Error ? e.message : "intel failed",
          });
        }
      });
    },
  };
}

/** Back-compat export used by older vite config */
export function marketQuoteApi() {
  return intelFeedsApi();
}
