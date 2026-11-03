# Hermes MCP server - Plan

Status: **plan only.** No code, no deploy, no secrets. Sits next to the AI panel (`ai-panel/`) and reuses its origin proxy.

## 1. Goal
Give Claude (and other MCP clients) a small, safe set of tools to **coordinate Nils' Hermes crew** (`cloudflare`, `minecraft`, `discord`, `homelab`): look at what the bots are doing, hand them work, steer or stop a run, and read results back, so one orchestrating session can split a task such as "payments PR for mc-stack and the matching website change" across bots and report one combined result.

Non-goals: replacing the panel, letting an MCP client change bot configuration, or removing the human from approvals.

## 2. What exists today (read from this repo)
- Hermes has a **gateway** (`127.0.0.1:8642`, per-profile bearer keys under `/gw/p/<bot>/...`) and a **dashboard** (`127.0.0.1:9119`, session token under `/dash/...`).
- `ai-panel/origin-proxy/proxy.mjs` listens on `127.0.0.1:8650`, requires `X-Hermes-Panel-Secret`, strips any credentials the caller sends, injects the right key per bot and returns 404 `unknown_bot` for a bot without a key.
- The panel Worker already wraps these calls: bots and SOUL, models, jobs (pause/resume/run), sessions and messages, `POST /runs` (start), `GET /runs/<id>`, `GET /runs/<id>/events` (SSE), and `POST /runs/<id>/(approval|steer|stop)`; the open PR #47 adds a read-only Crew-Runs tab with paged transcripts.
- `ai-panel/test/helpers.mjs` contains a mock Hermes used by the 94 existing tests.
- I have only seen Hermes through the panel's client code, not its own API documentation. Request and response shapes below must be confirmed against the real gateway before building.

## 3. Architecture
```
MCP client (Claude)
   | MCP over stdio (local) or Streamable HTTP (remote)
   v
hermes-mcp   (new small Node process, no dependencies, Nils' PC)
   | same loopback calls the panel Worker makes, plus X-Hermes-Panel-Secret
   v
origin-proxy 127.0.0.1:8650  ->  Hermes gateway 8642 / dashboard 9119
```
- `hermes-mcp` talks **only to the origin proxy**, never to Hermes directly. Keys therefore stay in one place and the per-bot key mapping and refusal rules apply to MCP calls too.
- It binds to loopback. Remote access, if wanted, goes through the existing Cloudflare Tunnel (a separate hostname such as `mcp.nwebnotfound.dev`) behind Cloudflare Access plus an MCP-level bearer token.
- Two transports: **stdio** for Claude Code on Nils' own PC (no network exposure at all) and **Streamable HTTP** for remote clients.
- Whether a cloud Claude session can attach this server depends on how that client supports custom/remote MCP servers (for claude.ai: a custom connector that needs a public HTTPS URL and its supported auth). **To verify before promising anything.**

## 4. Tools (proposal)
Tiers are enabled separately by environment flags; the default is read-only.

**Tier 0: read (default on)**
| Tool | Purpose |
|---|---|
| `hermes_list_bots` | Bot names, description, model, whether the gateway is running |
| `hermes_list_runs` | Recent runs per bot, filter API runs / CLI sessions, paged |
| `hermes_get_run` | Status, last events, token/cost counters |
| `hermes_get_transcript` | Paged messages of a session (hard limits like the panel: limit 1-200, offset capped) |
| `hermes_list_jobs` | Cron jobs of a bot, read-only |
| `hermes_usage` | Spend/credits summary, so an orchestrator can respect a budget |

**Tier 1: act (flag `HERMES_MCP_ALLOW_RUNS=1`)**
| Tool | Purpose |
|---|---|
| `hermes_start_run` | Start a run on one bot with a prompt; returns `run_id`. Runs are tagged `origin: mcp` so they are visible as such in the panel |
| `hermes_steer_run` | Send a steering message to a running run |
| `hermes_stop_run` | Stop a run |
| `hermes_trigger_job` | Run an existing cron job once |

**Tier 2: approvals (off, no flag in v1)**
- `hermes_approve` is **not offered**. Approvals are the safety boundary between an agent and side effects; the person who starts a run must not be able to approve its dangerous steps. Approvals stay in the panel with Nils. A later, narrow version could auto-approve a short allowlist of low-risk actions per bot, decided by Nils.

**Never exposed:** SOUL read/write, bot creation or deletion, job create/edit/delete, model switching, secrets, raw proxy access, anything under `/dash` that changes configuration.

## 5. Coordination pattern
1. Orchestrator reads `hermes_list_bots` and `hermes_usage`.
2. It splits the task and calls `hermes_start_run` on the fitting bots (for example `minecraft` for mc-stack, `cloudflare` for the website).
3. It polls `hermes_get_run` with an event cursor, or reads the transcript when finished.
4. Bots hand work back as **branches and pull requests**, never direct merges; this is policy in each bot's SOUL and is not enforced by the MCP server.
5. The orchestrator reports a combined summary and anything waiting for Nils (approvals, review).

## 6. Safety
- **Untrusted output.** Everything a bot returns is data. Tool results are wrapped and labelled as untrusted so text such as "ignore your instructions" inside a transcript or web page is not treated as a command.
- **Limits:** one active MCP-started run per bot, a global cap on concurrent runs, per-run and per-day budget (token and cost) read from `hermes_usage`, run timeouts, maximum prompt and response sizes, rate limits.
- **Kill switch:** a flag file or environment variable (`HERMES_MCP_ENABLED`) that stops all tools immediately; Tier 1 off by default after each restart.
- **Audit log:** append-only local log of every call (time, tool, bot, run id, caller, result code, no secrets) and a visible tag in the Crew-Runs tab.
- **Redaction:** responses pass through the same secret-pattern filter as logs (bearer tokens, `HERMES_KEY_*`, API keys).
- **Auth:** stdio needs none beyond the local OS user. Remote: Cloudflare Access (service token or Nils' login) and a separate MCP bearer token; the JWT is verified in `hermes-mcp` as the panel does.
- Credentials never appear in tool inputs or outputs, and the server refuses a bot name that does not match `^[a-z0-9][a-z0-9_-]{0,31}$`.
- The PC must be on; if the proxy is unreachable every tool returns a clear `hermes_offline` error instead of hanging.

## 7. Implementation plan (one PR each)
1. **Read-only server:** `ai-panel/mcp/` with stdio transport, Tier 0 tools, tests against the existing mock Hermes. No network exposure.
2. **Act tools:** Tier 1 behind flags, concurrency and budget limits, audit log, `origin: mcp` tag, tests for limits and the kill switch.
3. **Remote transport:** Streamable HTTP behind the tunnel and Access, auth tests, docs next to `ai-panel-tunnel.md`.
4. **Panel integration:** show MCP-started runs and the audit trail in the Crew-Runs tab.
5. **Optional:** a narrow approval allowlist (Tier 2) if Nils wants it.

## 8. Open questions for Nils
1. Local only (stdio on the PC) at first, or do you want remote access from the start?
2. Which bots may be started through MCP, and may any of them touch `main` directly (the plan assumes: no, only branches and PRs)?
3. Budget: maximum cost per run and per day?
4. Should MCP-started runs use a separate profile/key so they are easy to tell apart and revoke?
5. Any need for approvals through MCP, or do they stay in the panel only?
6. Can you share the Hermes gateway/dashboard API documentation, or should the build start by recording real responses?
