---
name: ghostfolio-sync
description: Refresh the local Ghostfolio holdings/accounts cache (.local/ghostfolio-cache.json) that the ghostfolio-updater agent resolves symbols and accounts against. Use before an entry session or after meaningful portfolio changes; read-only against Ghostfolio, writes only the ignored local cache.
---

# Ghostfolio Sync

Read-only against Ghostfolio. Writes one file, `.local/ghostfolio-cache.json`, which contains real account ids and holdings and must never be committed or quoted into tracked files.

1. Call `get_accounts`; save the JSON result to a temporary file.
2. Call `get_portfolio_holdings` with `date_range: "1d"`; save the result (large responses are saved to a file automatically — note the path).
3. From the project root run
   `python scripts/build_ghostfolio_cache.py <holdings_json> <accounts_json>`
   It writes the cache and prints the account count, holding count and `asof` timestamp.
4. Report those three figures. If the holding count dropped sharply against the previous cache, say so rather than overwriting silently — it can indicate a partial API response.

The updater treats a cache older than seven days as stale and falls back to live calls.
