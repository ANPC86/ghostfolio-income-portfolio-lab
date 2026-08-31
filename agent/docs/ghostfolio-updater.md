# Ghostfolio Updater — procedure

Use this to record a completed BUY, SELL, DIVIDEND, INTEREST or distribution in Ghostfolio from a pasted broker notification or the operator's dictation, or to add/remove a watchlist entry. It is mechanical execution. It is not portfolio advice, not a bulk import, and not Ghostfolio configuration.

All Ghostfolio access goes through the MCP server. Do not touch the database, the container, or the host.

## 1. Resolve before proposing anything

1. Read `.local/ghostfolio-cache.json`. If it is missing or older than seven days, refresh the facts you need with `get_accounts` and `get_portfolio_holdings` instead of guessing.
2. The **account must be stated**. Map the operator's label to a cache account name and take its id from the cache. Do not infer an account's tax status from its name.
3. Resolve the **symbol holdings-first**: exact cache symbol, then `<ticker>.TO`, then `<ticker>.V`. If nothing is held, check live holdings; only then use `lookup_symbols`. Use the matched symbol, `dataSource` and currency exactly as the profile reports them.
4. **Stop** when more than one listing is plausible (a bare ticker that exists as a US listing and as a `.TO`, `.V` or `.NE` listing), when the stated trade currency conflicts with the asset profile, or when the held quantity changed after the cache timestamp and the activity depends on it.

Never take the first lookup result because the raw ticker matches. A held `ABCD.TO` makes broker ticker `ABCD` a confident match; with no such holding, `ABCD` is ambiguous and needs the operator.

For a newly resolved market listing `dataSource` defaults to `YAHOO` unless the profile supplies another. Manual income labels (stock-lending income, interest) use `MANUAL`.

## 2. Validate the activity

**BUY / SELL** — require quantity, unit price, total, date and account. `quantity × unit price` must equal the stated total within $0.02. A mismatch is a question for the operator, not a fee to be inferred. Convert the order timestamp to UTC ISO 8601.

**DIVIDEND / distribution** — require account, symbol, net amount, date and the held quantity.

- Withholding: for a US-listed asset in an account without treaty relief, record gross and the withholding as `fee`: `gross = net / 0.85`, `fee = gross − net`. Treaty-relief accounts and Canadian-listed assets use `fee = 0`. "Registered" does not mean exempt; decide from the account's actual treaty status, which the operator states.
- Date from the data source, not the email: call `get_dividends_for_import` for the symbol, find the cycle being recorded, use its date at midnight UTC. Data sources report the **ex-dividend** date; brokers notify on the **payment** date. The gap is a day for weekly payers and days to weeks for monthly and quarterly ones — match the cycle by position in the series, not by proximity to the notification.
- Amount from the broker, date from the source. Never reconcile a rounding difference between them by changing the quantity.
- If the source states only a total, record `quantity: 1` with the payment as `unitPrice`. Do not back-derive a per-share rate the source did not give.
- Sanity check: an implied gross per-share rate above ~5% of market price is a stop — but only when `quantity > 1`; a `quantity: 1` lump-sum record always trips it and means nothing there.

**INTEREST / stock-lending income** — `dataSource: MANUAL`, a clear label as the symbol (e.g. `Stock Lending Income`), `quantity: 1`, the payout as `unitPrice`, `fee: 0` unless the source states one. Ghostfolio stores the label as the profile *name* and generates its own symbol, so verify against the name.

## 3. Duplicate check

Before every write, call `get_orders` for the resolved account. Same account, date, symbol, type, quantity and unit price already present is a **stop**. `get_dividends_for_import` also flags recorded cycles with `IS_DUPLICATE`; read an unflagged row as "no exact match", not "missing" — it matches on quantity and price as well as date.

The session that authorises the write confirms the duplicate check itself. A delegated agent's "no duplicate found" is a claim, not evidence; verifying costs one `get_orders` call.

## 4. Preflight, then wait

Show, in one block: account, raw broker symbol or income label, resolved symbol and name, resolution confidence, type, date (UTC), quantity, unit price, fee, currency, data source, net result. Then **stop and wait for explicit authorisation of that exact record.** Silence, "ok" to something else, or a general instruction earlier in the conversation are not authorisation.

## 5. Write, then verify from the record

`create_activity` with the validated fields. Set `comment` to `Posted by <assistant name>` and a short gross-up note where withholding applies. Read the created activity back and compare every financial field and the symbol profile. Report: type, symbol and name, account, quantity, unit price, fee, net result, activity id, source timestamp, assumptions.

Delete only an activity created in the same task or an id the operator supplied.

## 6. Correcting an existing activity

The MCP surface has no update verb. **Delete first, then create the replacement.** The order matters: a create that succeeds followed by a delete that is refused leaves a silent duplicate that overstates the portfolio; a delete followed by a failed create leaves a visible gap that is recoverable. For a batch, capture the full worklist (ids, symbols, dates, quantities, corrected prices, fees) to an ignored local file before the first delete, recreate only the entries whose delete succeeded, and verify afterwards that the total activity count is unchanged and no `(symbol, date)` pair appears more often than before. Lead the report with any failure.

## 7. Watchlist

`add_to_watchlist` / `remove_from_watchlist` need a data source. Default to `GHOSTFOLIO` unless the operator states one — deliberately the opposite of the activity default, and do not override it because the held profile says `YAHOO`. If the default source returns HTTP 500 it does not carry that listing: retry the **same listing** under the source that does (usually `YAHOO`). Never "fix" a 500 by dropping the exchange suffix — the bare ticker can be a different fund. `add_to_watchlist` returns an empty object on success; verify with `get_watchlist` and compare the returned name to the intended security.

## Stop conditions, collected

Missing required input · ambiguous account or listing · total does not reconcile · currency conflicts with the profile · likely duplicate · historical cash movement with no reconciled balance · anything that would need database, shell or container access · anything that turns into a judgment call about what *should* be held. Stop, state what is missing, and hand back.
