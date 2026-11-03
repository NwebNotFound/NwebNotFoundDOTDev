# Hermes MCP server - Plan

Status: **plan only.** No code, no deploy, no secrets. Sits next to the AI panel (`ai-panel/`) and reuses its origin proxy.

## 1. Goal
Give Claude (and other MCP clients) a small, safe set of tools to **coordinate Nils' Hermes crew** (`cloudflare`, `minecraft`, `discord`, `homelab`): look at what the bots are doing, hand them work, steer or stop a run, and read results back, so one orchestrating session can split a task such as "payments PR for mc-stack and the matching website change" across bots and report one combined result.

**Cost goal (Nils):** the heavy, token-hungry work (reading code, drafting, refactoring, long runs) should happen in the Hermes bots on their cheaper models, while Claude only **oversees and guides**: sets the task up, checks progress, reviews results and decides the next step. For that to save anything, tool results must be compact (section 6).

Delivery goal (Nils): a **custom connector in Claude**, so the server must be reachable as a remote MCP server (section 3) rather than only locally.

Non-goals: replacing the panel, letting an MCP client change bot configuration without Nils' confirmation, or removing the human from approvals.

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
- **Custom connector:** claude.ai supports adding a custom remote MCP server as a connector, which needs a public HTTPS URL and one of its supported auth methods. That makes the remote transport (PR 2 below) the first thing to build, with the read-only tools. Whether a given Claude client (claude.ai chat, Claude Code, a cloud session like the one that wrote this plan) can use a custom connector, and how, has to be **verified against Anthropic's current docs before building**; the plan does not assume it.
- Because the server is then reachable from the internet, Cloudflare Access in front plus MCP-level auth is mandatory, not optional.

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

**Tier 2: configure through proposals (flag `HERMES_MCP_ALLOW_PROPOSALS=1`)**
Nils wants Claude to be able to set the agents up. Direct writes would let a prompt injected into one bot's output rewrite another bot's instructions for good, so configuration goes through **proposals**:
| Tool | Purpose |
|---|---|
| `hermes_get_soul` | Read a bot's SOUL (instructions) |
| `hermes_propose_soul_change` | Submit a new SOUL text as a **pending proposal** with a diff and a reason; nothing changes yet |
| `hermes_propose_job` | Propose creating or changing a cron job (schedule, prompt, bot) |
| `hermes_list_proposals` / `hermes_withdraw_proposal` | See or withdraw pending proposals |
- A proposal appears in the panel with the diff; **Nils applies or rejects it with one tap** (the panel's existing write paths do the actual change, authenticated as Nils). Applied changes are logged and can be reverted to the previous SOUL.
- Model switching stays out until there is a clear allowlist of models and a cost ceiling.

**Tier 3: approvals (off, no flag in v1)**
- `hermes_approve` is **not offered**. Approvals are the safety boundary between an agent and side effects; the person who starts a run must not be able to approve its dangerous steps. Approvals stay in the panel with Nils. A later, narrow version could auto-approve a short allowlist of low-risk actions per bot, decided by Nils.

**Never exposed:** direct SOUL writes, bot creation or deletion, direct job create/edit/delete, model switching, secrets, raw proxy access, anything under `/dash` that changes configuration without going through a proposal.

## 5. Coordination pattern
1. Orchestrator reads `hermes_list_bots` and `hermes_usage`.
2. It splits the task and calls `hermes_start_run` on the fitting bots (for example `minecraft` for mc-stack, `cloudflare` for the website).
3. It polls `hermes_get_run` with an event cursor, or reads the transcript when finished.
4. Bots hand work back as **branches and pull requests**, never direct merges; this is policy in each bot's SOUL and is not enforced by the MCP server.
5. The orchestrator reports a combined summary and anything waiting for Nils (approvals, review).

## 6. Keeping Claude's usage low
- **Compact by default.** `hermes_get_run` returns status, elapsed time, token/cost counters, the last few event titles and, when finished, the bot's own final summary. Full transcripts are only returned on request and always paged.
- **Bots summarise themselves.** Each run ends with a short structured report (what was done, files/PRs touched, open questions, blockers); the orchestrator reads that instead of the transcript. Put this convention in each bot's SOUL via a proposal.
- **Event cursors** so repeated polling only returns what is new, and a `wait_for_change` style call with a timeout instead of tight polling.
- **Branches and PRs as the handover.** Claude reviews diffs and CI status, not whole sessions.
- Realistic expectation: Claude still spends tokens on planning, reading reports and reviewing. The saving comes from the bots doing the long mechanical work on cheaper models; it is not zero.

## 7. Safety
- **Untrusted output.** Everything a bot returns is data. Tool results are wrapped and labelled as untrusted so text such as "ignore your instructions" inside a transcript or web page is not treated as a command.
- **Limits:** one active MCP-started run per bot, a global cap on concurrent runs, per-run and per-day budget (token and cost) read from `hermes_usage`, run timeouts, maximum prompt and response sizes, rate limits.
- **Kill switch:** a flag file or environment variable (`HERMES_MCP_ENABLED`) that stops all tools immediately; Tier 1 off by default after each restart.
- **Audit log:** append-only local log of every call (time, tool, bot, run id, caller, result code, no secrets) and a visible tag in the Crew-Runs tab.
- **Redaction:** responses pass through the same secret-pattern filter as logs (bearer tokens, `HERMES_KEY_*`, API keys).
- **Auth:** stdio needs none beyond the local OS user. Remote: Cloudflare Access (service token or Nils' login) and a separate MCP bearer token; the JWT is verified in `hermes-mcp` as the panel does.
- Credentials never appear in tool inputs or outputs, and the server refuses a bot name that does not match `^[a-z0-9][a-z0-9_-]{0,31}$`.
- The PC must be on; if the proxy is unreachable every tool returns a clear `hermes_offline` error instead of hanging.

## 8. Implementation plan (one PR each)
1. **Read-only server:** `ai-panel/mcp/` with Tier 0 tools, stdio transport and tests against the existing mock Hermes. No network exposure.
2. **Remote transport and auth:** Streamable HTTP behind the tunnel and Cloudflare Access, MCP-level bearer/OAuth as the connector requires, tests, docs next to `ai-panel-tunnel.md`. This is what makes the custom connector possible.
3. **Act tools:** Tier 1 behind flags, concurrency and budget limits, audit log, `origin: mcp` tag, tests for limits and the kill switch.
4. **Proposals:** Tier 2 tools plus the panel UI to review, apply and revert a proposal (touches the panel Worker).
5. **Panel integration:** show MCP-started runs and the audit trail in the Crew-Runs tab.
6. **Optional:** a narrow approval allowlist (Tier 3) if Nils wants it.

## 9. Open questions for Nils
1. Remote from the start (needed for a custom connector)? The plan assumes yes, read-only first.
2. Which bots may be started through MCP, and may any of them touch `main` directly (the plan assumes: no, only branches and PRs)?
3. Budget: maximum cost per run and per day?
4. Should MCP-started runs use a separate profile/key so they are easy to tell apart and revoke?
5. Configuration through proposals that you apply with one tap: is that the right level, or do you want a bot or two where Claude may write the SOUL directly?
6. Approvals: stay in the panel only?
7. Can you share the Hermes gateway/dashboard API documentation, or should the build start by recording real responses?
