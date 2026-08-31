# Letting an AI assistant record activities

Once the MCP server from [`compose/ghostfolio-mcp`](../compose/ghostfolio-mcp/) is up, an assistant can read the portfolio. Recording a trade or a dividend it was told about is the next step, and that is where a bare "here are 36 tools" setup goes wrong: the assistant picks the first symbol match, invents a fee to make a total reconcile, or writes the same dividend twice. The files here turn that into a bounded, checkable procedure.

```
agent/
├── docs/ghostfolio-updater.md            the procedure — rules, stop conditions, verification
├── docs/acceptance-cases.md              what the procedure must do in each situation
├── scripts/build_ghostfolio_cache.py     builds the local holdings/accounts cache the procedure resolves against
├── claude/agents/ghostfolio-updater.md   Claude Code sub-agent definition
├── claude/skills/ghostfolio-sync/SKILL.md  Claude Code skill that refreshes the cache
└── prompt/ghostfolio-updater-system-prompt.md   the same procedure as a system prompt for any other LLM
```

The procedure is the product; the Claude and prompt files are thin wrappers that point at it.

## What the procedure enforces

- **Nothing is written without an explicit go-ahead** for that exact activity. The assistant prepares, validates, shows the resolved fields, and waits.
- **Resolution before proposal.** Account and symbol are resolved from what the portfolio already holds (via a local cache) before any lookup; a broker ticker that could be a US listing or a `.TO`/`.V`/`.NE` listing stops for confirmation.
- **Arithmetic checks.** `quantity × unit price` must match the stated total within $0.02; a mismatch is a question, not a fee.
- **Duplicate check.** `get_orders` for the account before every write; same account, date, symbol, type, quantity and unit price is a stop.
- **Correction = delete, then create.** Never the reverse — a blocked delete after a create leaves a silent duplicate.
- **Verify from the record, not the response.** Read the created activity back and compare every field; an empty success body proves nothing.

It does not give investment advice, decide allocation, bulk-import, or change Ghostfolio configuration.

## Walkthrough — what a session looks like

Illustrative transcript, synthetic figures. The account is a TFSA at a Canadian brokerage, the cache was refreshed with `/ghostfolio-sync` that morning, and the operator pastes the two notification emails the brokerage sent. Tool calls the agent makes are shown in brackets.

---

**You:** Two notifications from today, TFSA. Record both.

> Your order to buy 14 shares of XEQT has been filled.
> Average price: $34.12 per share · Total: $477.68 · Account: TFSA
> Filled Aug 28, 2026, 9:47 a.m. ET

> You received a dividend of $48.60 from VFV in your TFSA.
> Paid Aug 28, 2026

**Claude (ghostfolio-updater):** I'll prepare both. Nothing is written until you confirm each record.

*[Read `.local/ghostfolio-cache.json` — asof 2026-08-28T13:02Z, 3 accounts, 12 holdings]*

**Order fill**

- Account `TFSA` → resolved from the cache.
- Broker ticker `XEQT`: the cache holds `XEQT.TO` (iShares Core Equity ETF Portfolio, CAD, YAHOO). High-confidence match; no lookup needed.
- Arithmetic: 14 × 34.12 = 477.68, matches the stated total to the cent. No fee implied.
- Date: 2026-08-28 09:47 ET → `2026-08-28T13:47:00.000Z`.

*[`get_orders` for TFSA — no BUY of XEQT.TO on 2026-08-28 with quantity 14 at 34.12]*

| field | value |
|---|---|
| type | BUY |
| symbol | XEQT.TO — iShares Core Equity ETF Portfolio |
| account | TFSA |
| date | 2026-08-28T13:47:00.000Z |
| quantity | 14 |
| unit price | 34.12 CAD |
| fee | 0.00 |
| data source | YAHOO |
| net | −477.68 CAD |

**Dividend**

- Broker ticker `VFV`: the cache holds `VFV.TO` (Vanguard S&P 500 Index ETF, CAD), 120 units.
- Canadian-listed, so no withholding: `fee = 0`, gross = net = 48.60.
- Per-unit rate implied by the held quantity: 48.60 / 120 = 0.405. The brokerage stated only the total, so I will record the payment as it was given — `quantity 1`, `unit price 48.60` — rather than derive a rate the source did not state.

*[`get_dividends_for_import` for VFV.TO / YAHOO — the latest cycle is dated **2026-08-15** (ex-dividend), rate 0.4050]*

- The data source's per-unit rate agrees with the implied one, which corroborates the amount. The date differs: the brokerage paid on the 28th, the data source records the ex-date, 15 August. I'll date the record **2026-08-15** so it lines up with the series Ghostfolio's duplicate detection works from; the email date is evidence, not the record date.
- The cycle is not flagged `IS_DUPLICATE` and `get_orders` shows no VFV.TO dividend on 2026-08-15.

| field | value |
|---|---|
| type | DIVIDEND |
| symbol | VFV.TO — Vanguard S&P 500 Index ETF |
| account | TFSA |
| date | 2026-08-15T00:00:00.000Z (ex-dividend date; paid 2026-08-28) |
| quantity | 1 |
| unit price | 48.60 CAD |
| fee | 0.00 |
| data source | YAHOO |
| net | +48.60 CAD |

Confirm each: **(a)** the XEQT.TO buy, **(b)** the VFV.TO dividend.

**You:** a and b, go.

**Claude (ghostfolio-updater):** *[`create_activity` ×2, then `get_orders` to read both records back]*

Both written and verified against the returned records:

| | id | symbol | date | qty × price | fee | net |
|---|---|---|---|---|---|---|
| BUY | `…a41f` | XEQT.TO | 2026-08-28 | 14 × 34.12 | 0 | −477.68 CAD |
| DIVIDEND | `…9c2e` | VFV.TO | 2026-08-15 | 1 × 48.60 | 0 | +48.60 CAD |

Comments set to `Posted by Claude`. Assumptions on record: the dividend is dated by the data source's ex-date, not the payment date; it is stored as a lump sum because the notification gave no per-unit rate. Cash balances were not changed — Ghostfolio's MCP `create_activity` does not move cash; if you keep account cash in Ghostfolio, that is a separate balance update.

---

### Where it stops instead

The same session, had the inputs been different:

- **`quantity × price ≠ total`** — "14 × 34.12 is 477.68 but the email says 479.63. That is a $1.95 difference; I won't record it as a fee. Was there a commission line, or is the quantity different?"
- **Unheld, ambiguous ticker** — "`ABCD` is not held and resolves to both a US listing and `ABCD.TO`. Which one?"
- **Already recorded** — "There is already a VFV.TO dividend on 2026-08-15 for 48.60 in TFSA (id `…9c2e`). Not creating a second one."
- **A US-listed payer in a non-treaty account** — the preflight would show gross `net / 0.85` with the 15% withholding as `fee`, and ask you to confirm the account's treaty status rather than infer it from the name.

What you do not get: a recommendation about XEQT, a view on whether the dividend is sustainable, or any write you did not say yes to.

## Setup — Claude Code

Point Claude Code at the MCP server, then copy the two definitions into the project where you will do the entry work.

```bash
# 1. MCP server (per project); the bearer is MCP_HTTP_BEARER_TOKEN from compose/ghostfolio-mcp/.env
claude mcp add --transport http ghostfolio http://<nas-ip>:8438/mcp \
       --header "Authorization: Bearer <MCP_HTTP_BEARER_TOKEN>"

# 2. Agent + skill + docs into your project
mkdir -p .claude/agents .claude/skills docs/skills scripts .local
cp agent/claude/agents/ghostfolio-updater.md   .claude/agents/
cp -r agent/claude/skills/ghostfolio-sync       .claude/skills/
cp agent/docs/ghostfolio-updater.md            docs/skills/
cp agent/scripts/build_ghostfolio_cache.py     scripts/
echo ".local/" >> .gitignore
```

Then, in a Claude Code session in that project:

1. `/ghostfolio-sync` — reads accounts and holdings through the MCP server and writes `.local/ghostfolio-cache.json`. The cache holds real account ids and holdings, which is why it lives in an ignored folder.
2. Paste a broker notification or dictate the activity and ask for the `ghostfolio-updater` agent. It resolves, validates, and shows the proposed record. Nothing is written until you say so.

The agent definition restricts the sub-agent to the MCP tools it needs (reads, `create_activity`, `delete_activity`, watchlist) plus `Read`/`Bash` for the cache; it cannot reach account or market-data administration. The MCP server itself should stay `READ_ONLY_MODE=false` only for the user whose activities you record — for anything else, keep a read-only server.

## Setup — any other LLM

Give the model [`prompt/ghostfolio-updater-system-prompt.md`](prompt/ghostfolio-updater-system-prompt.md) as its system prompt and connect it to the same MCP server (any MCP-capable client: Claude Desktop, an OpenAI-compatible agent framework, LibreChat, …). The prompt carries the same rules; what it cannot carry is the tool allow-list, so use `READ_ONLY_MODE=true` on the MCP server until you have watched the model follow the write gate, and prefer a client that lets you disable tools you do not want reachable.

## Adapting

`docs/ghostfolio-updater.md` is written for a Canadian brokerage account with US and Canadian listings (`.TO`, `.V`, `.NE` suffixes, 15% US withholding on dividends in non-treaty accounts). Change the withholding rule and the suffix list for your jurisdiction; the structure — resolve, validate, gate, write, verify — does not change.
