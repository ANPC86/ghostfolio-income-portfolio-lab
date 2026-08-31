# Compose files

Two stacks, meant to be deployed in this order on the same Docker host.

| Folder | What it runs | Publishes |
|---|---|---|
| [`ghostfolio/`](ghostfolio/) | Ghostfolio 3.64.0, Postgres 18, Redis 8, and an opt-in daily backup sidecar | `3333` |
| [`ghostfolio-mcp/`](ghostfolio-mcp/) | [mhajder/ghostfolio-mcp](https://github.com/mhajder/ghostfolio-mcp) 1.6.1 for **one** Ghostfolio user, HTTP transport, read-only by default | `8438` |

Each folder has a `.env.example`; copy it to `.env`, fill in the placeholders, and keep `.env` out of version control (the root `.gitignore` already ignores it).

```bash
cd compose/ghostfolio && cp .env.example .env && $EDITOR .env
docker compose --profile backup up -d        # drop --profile backup if you do not want the dump sidecar
curl -f http://localhost:3333/api/v1/health  # {"status":"OK"}

cd ../ghostfolio-mcp && cp .env.example .env && $EDITOR .env
docker compose up -d
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8438/mcp \
     -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
# 401 without the bearer, 200 with it
```

Notes that cost time when missed:

- **Pin the tags.** Ghostfolio released 3.59 → 3.64 in one week of August 2026; the MCP image and anything reading the API should move when you decide, not when a watcher decides. If your NAS has an auto-update feature, exclude these containers from it.
- **Postgres 18 data path** is `/var/lib/postgresql`, not `/var/lib/postgresql/data`. The volume mount above is correct for 18; do not reuse a 15–17 mount line.
- **Backups** land in `compose/ghostfolio/backups/` as `ghostfolio-db-latest.sql.gz` plus dated copies. A restore is `gunzip -c <dump> | docker exec -i ghostfolio-db psql -U <user> -d <db>`; the dump is written with `--clean --if-exists`, so restoring over an existing database is safe.
- **Ports.** Check the host before choosing one — `ss -ltn | grep :8438` and `docker ps --format '{{.Ports}}'` together; a port a NAS app or another stack already holds fails the MCP container's start with "port is already allocated".
- **One MCP server per Ghostfolio user.** The server holds one token, so it represents one user. Name each registration after the user (`ghostfolio`, `ghostfolio-demo`, …).
