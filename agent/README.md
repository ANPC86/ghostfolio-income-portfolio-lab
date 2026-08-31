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
