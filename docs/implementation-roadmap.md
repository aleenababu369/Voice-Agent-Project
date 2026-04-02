# Implementation Roadmap

## Phase 0: Foundation

- monorepo structure
- domain contracts
- configuration model
- backend skeleton
- admin shell

## Phase 1: MVP

Target outcome:
Handle outbound reminder and enquiry calls with safe fallbacks.

Deliverables:

- call session lifecycle
- consent flow
- workflow registry
- clarification and escalation policy
- call logging and outcome storage

## Phase 2: Realtime intelligence

Target outcome:
Support near real-time voice conversations with streaming components.

Deliverables:

- telephony adapter
- streaming ASR adapter
- LLM router
- TTS adapter
- barge-in support

## Phase 3: Domain completion

Target outcome:
Support full education and healthcare workflows.

Deliverables:

- appointment booking
- fee reminder acknowledgement
- institutional enquiry flows
- healthcare follow-up confirmation
- human transfer summary payload

## Phase 4: Production hardening

Target outcome:
Operationally ready deployment.

Deliverables:

- RBAC
- audit dashboards
- alerting
- SLOs and performance benchmarks
- red-team and safety evaluation

## Non-functional targets from the report

- turn-switch latency under 600 ms
- intent handling accuracy above 90% for supported flows
- task completion above 85% for pilot flows
- escalation rate under 20% overall and under 5% for safety events
