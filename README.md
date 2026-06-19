# Multilingual AI Voice Agent Platform

M.Tech final-year project:

**A Low-Latency Multilingual AI Voice Agent for Automated Telephonic Interactions in Education and Healthcare.**

A multi-user platform where each account builds, deploys, and runs its own voice agent. Calls are **simulated in the browser** (no telephony cost), but the agent, the model, the data collection, and the analytics are all real and run locally — no deployment required.

## The workflow

1. **Sign up / log in** — many users, each with an isolated account.
2. **Onboard once** — choose a use case (hospital / education / front desk); a starter agent is provisioned.
3. **Build & deploy an agent** — configure its prompt, what it says and asks, the fields to collect, and languages; then deploy it so it can take calls.
4. **Add prospects** — the people the agent will talk to (with their known details).
5. **Run calls** — inbound (a prospect calls in) or outbound (the agent dials prospects in an active campaign).
6. **Operations & analytics** — every completed call books a real operation (appointment, enquiry, visitor routing) against the prospect, with per-call and aggregate analytics.

## Architecture

- **Monorepo** — `apps/api` (Fastify + TypeScript), `apps/admin` (React 19 + Vite), `packages/contracts` (shared types).
- **Auth** — signup/login with scrypt-hashed passwords and HS256 JWTs (built on `node:crypto`, no extra dependencies). All data is scoped to the authenticated account.
- **Entities** — accounts, agents (profiles with versioning), prospects, campaigns, call sessions, and operations. In-memory by default; an optional PostgreSQL path mirrors it (`infra/sql/*.sql`).
- **Conversation engine** — a turn pipeline with consent capture, a safety/escalation policy, slot extraction, and completion. `services/call-runner.ts` is shared by the REST turn route, the campaign dialer, and the softphone relay.
- **Real model (optional)** — an OpenAI-compatible LLM adapter drives the agent's replies and field extraction when configured; otherwise the built-in zero-cost rule engine runs. ASR/TTS use the browser's Web Speech APIs.
- **Two-tab softphone** — a backend WebSocket relay lets a real person answer a call in a second browser tab while the dashboard monitors the conversation live.

## Run locally

```bash
npm run dev:api      # API at http://127.0.0.1:5005
npm run dev:admin    # Dashboard at http://127.0.0.1:5173
```

Open the dashboard, sign up (or use a demo login), and walk the workflow. Demo accounts (already seeded):

| Email | Password | Use case |
| --- | --- | --- |
| `hospital@demo.local` | `demo1234` | healthcare |
| `college@demo.local` | `demo1234` | education |
| `frontdesk@demo.local` | `demo1234` | front desk |

### Try the full flow

1. **Agents** → deploy the starter agent.
2. **Prospects** → add a few people (give fields such as `patient_name`, `age`, `issue`, `doctor_name`, `preferred_date`, `preferred_time`).
3. **Campaigns** → create an outbound campaign, add the prospects, **Activate**, then **Run auto-dial** and watch the live queue book appointments hands-free.
4. **Live two-tab call** → **Call console** → place a call → **Open softphone** (a second tab) → answer and talk as the prospect; the console shows the transcript and analytics in real time.
5. **Call history / Analytics** → inspect per-call detail (duration, turns, latency, confidence, transcript, collected data) and aggregate, campaign, and prospect-funnel metrics.

> The softphone needs the browser microphone, which only works on `localhost` or HTTPS. On `localhost` (one machine, two tabs) it works out of the box; on a second device over plain `http://<lan-ip>` the mic is blocked, so type the prospect's replies instead.

## Configuration

Copy `.env.example` and adjust as needed. Everything runs in-memory with no config; the optional pieces:

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Secret used to sign login tokens (set a strong value in production). |
| `AUTH_ENFORCE` | `true` to require a valid token on all non-public routes. |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Point the agent at a real OpenAI-compatible model (e.g. OpenAI, or a free local Ollama / LM Studio at `http://localhost:11434/v1`). Leave unset to use the built-in rule engine. |
| `DATABASE_URL` | Optional PostgreSQL; falls back to in-memory when unavailable. |

## Build & verify

```bash
npm run build:admin                              # production build of the dashboard
npx tsc -p apps/api/tsconfig.json --noEmit       # type-check the API
npx tsc -p apps/admin/tsconfig.json --noEmit     # type-check the dashboard
npm run smoke:api                                # boot the API and hit /health
```

## What makes it a real demo

- No paid telephony and no paid APIs required (real LLM optional, local model works).
- Real authentication and per-account isolation.
- Real inbound/outbound calls simulated through the browser, including a genuine two-tab "answer the call" experience.
- Real prospects, campaigns, and an auto-dialer that collects data and performs operations.
- Real per-call and real-time analytics, with a downloadable daily handoff report.
- A professional, monochrome dashboard with a collapsible sidebar and dedicated pages per entity.
