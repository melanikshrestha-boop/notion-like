/**
 * Optional Plaid bridge for Wonder Finances (Mintable-style bank sync).
 *
 * Set in .env / shell:
 *   PLAID_CLIENT_ID=...
 *   PLAID_SECRET=...
 *   PLAID_ENV=sandbox | development | production
 *
 * Without keys: status endpoint reports disabled; UI still tracks via CSV.
 * Access tokens stay in server memory only (dev). Production would use a vault.
 */

const tokensByItem = new Map(); // item_id -> access_token (dev memory)

function plaidBase(env) {
  const e = (env.PLAID_ENV || process.env.PLAID_ENV || "sandbox").toLowerCase();
  if (e === "production") return "https://production.plaid.com";
  if (e === "development") return "https://development.plaid.com";
  return "https://sandbox.plaid.com";
}

function creds(env) {
  const client_id = env.PLAID_CLIENT_ID || process.env.PLAID_CLIENT_ID || "";
  const secret = env.PLAID_SECRET || process.env.PLAID_SECRET || "";
  const plaidEnv = (env.PLAID_ENV || process.env.PLAID_ENV || "sandbox").toLowerCase();
  return { client_id, secret, plaidEnv, ready: Boolean(client_id && secret) };
}

async function plaidPost(env, path, body) {
  const { client_id, secret } = creds(env);
  const res = await fetch(`${plaidBase(env)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, secret, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error_message || data?.error_code || `plaid ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

export function plaidFinanceApi(opts = {}) {
  const env = opts.env || {};
  return {
    name: "wonder-plaid-finance-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/finance/plaid")) return next();
        const u = new URL(req.url, "http://127.0.0.1");
        const path = u.pathname;
        const c = creds(env);

        try {
          // GET /api/finance/plaid/status
          if (path === "/api/finance/plaid/status" && req.method === "GET") {
            return json(res, 200, {
              ready: c.ready,
              env: c.plaidEnv,
              linkedItems: tokensByItem.size,
              message: c.ready
                ? "Plaid keys loaded. You can connect a bank (sandbox or live)."
                : "Add PLAID_CLIENT_ID + PLAID_SECRET to enable bank connect. CSV import works without Plaid.",
              setupUrl: "https://dashboard.plaid.com/developers/keys",
              mintableDocs: "https://github.com/kevinschaich/mintable",
            });
          }

          if (!c.ready) {
            return json(res, 503, {
              error: "plaid_not_configured",
              message:
                "Set PLAID_CLIENT_ID and PLAID_SECRET (free Plaid plan) then restart Vite.",
            });
          }

          // POST /api/finance/plaid/link-token
          if (path === "/api/finance/plaid/link-token" && req.method === "POST") {
            const body = await readBody(req);
            const userId = body.userId || "wonder-melani";
            const data = await plaidPost(env, "/link/token/create", {
              user: { client_user_id: String(userId) },
              client_name: "Wonder Finances",
              products: ["transactions"],
              country_codes: ["US"],
              language: "en",
            });
            return json(res, 200, { link_token: data.link_token });
          }

          // POST /api/finance/plaid/exchange  { public_token }
          if (path === "/api/finance/plaid/exchange" && req.method === "POST") {
            const body = await readBody(req);
            if (!body.public_token) {
              return json(res, 400, { error: "public_token required" });
            }
            const data = await plaidPost(env, "/item/public_token/exchange", {
              public_token: body.public_token,
            });
            tokensByItem.set(data.item_id, data.access_token);
            // institution name
            let institutionName = "Bank";
            try {
              const item = await plaidPost(env, "/item/get", {
                access_token: data.access_token,
              });
              const instId = item?.item?.institution_id;
              if (instId) {
                const inst = await plaidPost(env, "/institutions/get_by_id", {
                  institution_id: instId,
                  country_codes: ["US"],
                });
                institutionName = inst?.institution?.name || institutionName;
              }
            } catch {
              /* optional */
            }
            return json(res, 200, {
              item_id: data.item_id,
              institutionName,
              // never return access_token to browser
            });
          }

          // POST /api/finance/plaid/sync  { item_id? }
          if (path === "/api/finance/plaid/sync" && req.method === "POST") {
            const body = await readBody(req);
            let access_token = null;
            let item_id = body.item_id;
            if (item_id && tokensByItem.has(item_id)) {
              access_token = tokensByItem.get(item_id);
            } else if (tokensByItem.size === 1) {
              const [id, tok] = [...tokensByItem.entries()][0];
              item_id = id;
              access_token = tok;
            }
            if (!access_token) {
              return json(res, 400, {
                error: "no_linked_item",
                message: "Connect a bank first (Link flow).",
              });
            }

            // accounts
            const acctData = await plaidPost(env, "/accounts/get", {
              access_token,
            });
            const accounts = (acctData.accounts || []).map((a) => ({
              plaidAccountId: a.account_id,
              name: a.name || a.official_name || "Account",
              mask: a.mask || null,
              kind: mapPlaidType(a.type, a.subtype),
              balance:
                a.balances?.current != null
                  ? Number(a.balances.current)
                  : a.balances?.available != null
                    ? Number(a.balances.available)
                    : 0,
              institution: body.institutionName || "Bank",
            }));

            // transactions last 90 days
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 90);
            const start_date = start.toISOString().slice(0, 10);
            const end_date = end.toISOString().slice(0, 10);

            const txData = await plaidPost(env, "/transactions/get", {
              access_token,
              start_date,
              end_date,
              options: { count: 500, offset: 0 },
            });

            const transactions = (txData.transactions || []).map((t) => {
              // Plaid: positive amount = money leaving account (expense)
              const amt = Number(t.amount) || 0;
              const expense = amt >= 0;
              return {
                externalId: t.transaction_id,
                date: t.date,
                kind: expense ? "expense" : "income",
                amount: Math.abs(amt),
                merchant: t.merchant_name || t.name || "Transaction",
                note: t.name || "",
                category:
                  (t.personal_finance_category &&
                    t.personal_finance_category.primary) ||
                  (Array.isArray(t.category) ? t.category[0] : null) ||
                  "Uncategorized",
                accountId: t.account_id,
                pending: !!t.pending,
                source: "plaid",
              };
            });

            return json(res, 200, {
              item_id,
              accounts,
              transactions,
              total: txData.total_transactions,
              syncedAt: new Date().toISOString(),
            });
          }

          // Sandbox helper: create public token without Link UI (dev only)
          if (
            path === "/api/finance/plaid/sandbox-public-token" &&
            req.method === "POST" &&
            c.plaidEnv === "sandbox"
          ) {
            const data = await plaidPost(env, "/sandbox/public_token/create", {
              institution_id: "ins_109508", // First Platypus Bank
              initial_products: ["transactions"],
            });
            return json(res, 200, { public_token: data.public_token });
          }

          return json(res, 404, { error: "unknown_plaid_route" });
        } catch (e) {
          return json(res, 502, {
            error: e instanceof Error ? e.message : "plaid failed",
          });
        }
      });
    },
  };
}

function mapPlaidType(type, subtype) {
  const t = `${type || ""} ${subtype || ""}`.toLowerCase();
  if (t.includes("credit") || t.includes("credit card")) return "credit";
  if (t.includes("saving")) return "savings";
  if (t.includes("checking")) return "checking";
  if (t.includes("investment") || t.includes("brokerage")) return "invest";
  return "other";
}
