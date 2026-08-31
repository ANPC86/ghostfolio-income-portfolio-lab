# Ghostfolio updater — acceptance cases

Reasoning fixtures for the procedure in [`ghostfolio-updater.md`](ghostfolio-updater.md). Tickers are placeholders.

| Case | Situation | Expected behaviour |
| --- | --- | --- |
| Broker ticker `ABCD` | The portfolio holds `ABCD.TO` | Resolve `ABCD.TO` with high confidence |
| Broker ticker `ABCD` | No matching holding or saved mapping | Stop for operator confirmation |
| Canadian `.UN` broker symbol | One held `-UN.TO` listing | Use the held listing |
| CAD-hedged depositary receipt | One held `.NE` listing | Use the held `.NE` listing |
| US ticker and Canadian listing both plausible | Nothing held | Stop; do not take the first lookup result |
| BUY or SELL | `quantity × unit price` differs from the stated total by more than $0.02 | Stop; do not infer a fee |
| BUY or SELL | Same account, date, symbol, type, quantity, unit price already recorded | Stop before creating |
| Dividend, US-listed asset, no treaty relief | Net amount stated | Record gross and withholding fee; verify the net |
| Dividend, source states only a total | No per-share rate given | `quantity: 1`, payment as unit price; do not derive a rate |
| Dividend date | Broker notifies on payment date | Use the data source's ex-dividend date for the matching cycle |
| Interest / stock-lending payout | Explicit account, currency, date, amount | `INTEREST`, `MANUAL`, `quantity: 1`, label as symbol |
| Missing or ambiguous account | — | Stop before resolving or writing |
| Correction of an existing activity | Operator supplies the id | Delete, verify the delete, then create the replacement |
| Watchlist add, source unstated | Operator names a symbol only | Use `GHOSTFOLIO`; do not inherit the `YAHOO` activity default |
| Watchlist add returns HTTP 500 | Default source lacks the listing | Retry the same listing under `YAHOO`; never drop the suffix |
| Watchlist add succeeds | Empty response body | Verify via `get_watchlist`; compare the profile name |
| Any write | No explicit authorisation for that exact record | Show the preflight and wait |
