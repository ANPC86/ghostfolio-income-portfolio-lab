"""Build the local Ghostfolio entry cache from raw MCP tool results.

Usage:
    python scripts/build_ghostfolio_cache.py <holdings_json> <accounts_json> [out_path]

Inputs are the saved JSON results of the Ghostfolio MCP tools
`get_portfolio_holdings` and `get_accounts`. Output (default
`.local/ghostfolio-cache.json`) is a compact cache used by the
ghostfolio-updater agent for symbol/account resolution. The cache
contains real holdings and account IDs and must never be committed;
`.local/` is gitignored.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def load(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)

    holdings_raw = load(sys.argv[1])
    accounts_raw = load(sys.argv[2])
    out_path = Path(sys.argv[3] if len(sys.argv) > 3 else ".local/ghostfolio-cache.json")

    holdings = []
    for h in holdings_raw.get("holdings", []):
        profile = h.get("assetProfile") or {}
        symbol = profile.get("symbol")
        if not symbol:
            continue
        holdings.append(
            {
                "symbol": symbol,
                "name": profile.get("name"),
                "dataSource": profile.get("dataSource"),
                "currency": profile.get("currency"),
                "quantity": h.get("quantity"),
                "marketPrice": h.get("marketPrice"),
            }
        )
    holdings.sort(key=lambda x: x["symbol"])

    # get_accounts may return {"accounts": [...]} or a bare list
    raw_accounts = accounts_raw.get("accounts", accounts_raw) if isinstance(accounts_raw, dict) else accounts_raw
    accounts = [
        {
            "name": a.get("name"),
            "id": a.get("id"),
            "currency": a.get("currency"),
        }
        for a in raw_accounts
        if isinstance(a, dict) and a.get("id")
    ]
    accounts.sort(key=lambda x: x["name"] or "")

    cache = {
        "asof": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "accounts": accounts,
        "holdings": holdings,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}: {len(accounts)} accounts, {len(holdings)} holdings, asof {cache['asof']}")


if __name__ == "__main__":
    main()
