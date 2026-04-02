# Multilingual AI Voice Agent

This repository is the build foundation for your M.Tech final-year project:

**A Low-Latency Multilingual AI Voice Agent for Automated Telephonic Interactions in Education and Healthcare**

## Fully no-cost demo mode

This project supports a fully zero-cost demo path.

It uses:

- the existing backend session and orchestration APIs
- a React + Vite frontend with Tailwind v4
- Redux Toolkit for demo/session state
- Axios for API communication
- browser speech synthesis for voice output
- optional browser speech recognition for mic input when supported
- mock ASR, LLM, and TTS adapters on the backend
- multilingual demo utterances for English, Hindi-style, and Kannada-style flows

## Run locally

Start the backend:

```bash
npm run dev:api
```

Start the frontend:

```bash
npm run dev:admin
```

Build the frontend:

```bash
npm run build:admin
```

## Demo strengths

- no paid APIs required
- no paid telephony required
- multilingual scenario simulation
- workflow slot validation
- live metrics and event timeline
- presentation-friendly browser call experience

## Platform capabilities

- reusable agent profile templates for hospital appointments, front desk reception, and education reception
- dashboard-based customization of prompts, behavior, and required fields per use case
- validation rules that keep profile configuration aligned with domain-specific data collection
- structured session records that store collected caller details from each conversation
- simulator sessions now run the exact selected profile, not just a generic workflow
- searchable records dashboard with per-session collected data views
- backend-powered analytics for platform, domain, and profile performance
- CSV export for collected records during demos and reviews`r`n- follow-up workflow management with statuses, assignees, and notes per conversation`r`n- follow-up pipeline analytics for open and resolved tenant records
- role-based admin switching for viewer, editor, and admin demo personas
- profile version history with restore support for safe configuration changes
- tenant workspaces so each hospital, college, or reception customer has isolated profiles, records, analytics, and admin access

## Multi-tenant flow

- choose a tenant workspace from the dashboard
- manage that tenant's profiles and admin users
- run the zero-cost browser demo against that tenant's agent profiles
- collect structured records and analytics only inside that workspace`r`n- assign and track tenant-specific follow-up actions directly from the records dashboard

