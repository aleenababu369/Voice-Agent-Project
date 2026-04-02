# Architecture Blueprint

## Product goal

Build a low-latency multilingual voice agent for education and healthcare that automates routine telephonic workflows while staying safe, compliant, and human-escalatable.

## Core capabilities from the project report

- autonomous inbound and outbound call handling
- multilingual and code-switched voice interaction
- goal-oriented dialogue management
- uncertainty-aware clarification and escalation
- appointment, reminder, and enquiry workflows
- consent capture, PII redaction, auditability, and analytics

## Proposed architecture

### 1. Telephony edge

Responsibilities:

- receive inbound call events
- initiate outbound campaigns
- stream audio frames
- manage hangup, retry, and transfer events

Examples:

- SIP/Asterisk for self-hosted deployments
- Twilio or Exotel for managed telephony

### 2. Realtime conversation runtime

Responsibilities:

- maintain call session state
- coordinate ASR, dialogue policy, LLM response generation, and TTS
- support barge-in and low-latency turn switching
- enforce safety rules before responding

Key internal components:

- `DialogueOrchestrator`
- `GoalGraph`
- `ConfidencePolicy`
- `ConversationMemory`

### 3. AI adapters

Responsibilities:

- streaming ASR for English, Hindi, and future regional languages
- response generation through an LLM router
- low-latency TTS synthesis
- language identification and code-switch detection

Design principle:

Keep adapters swappable so we can compare quality, latency, and cost per deployment.

### 4. Domain workflow engine

Responsibilities:

- enquiry resolution
- appointment booking
- reminders and confirmations
- fee/payment acknowledgement
- future WhatsApp or SMS follow-up

Design principle:

Each workflow should expose:

- required slots
- completion criteria
- escalation conditions
- allowed actions

### 5. Compliance and observability

Responsibilities:

- verbal consent tracking
- PII redaction before persistence
- audit logging
- outcome analytics
- latency and containment dashboards

### 6. Operations dashboard

Responsibilities:

- view live and recent calls
- inspect confidence drops and escalations
- review workflow success rates
- manage institution-specific configurations

## Initial deployment model

### Phase 1

- monorepo
- single backend service
- in-memory session store
- static admin shell

### Phase 2

- PostgreSQL for durable storage
- Redis for session and event buffering
- telephony provider integration
- streaming ASR/TTS adapters

### Phase 3

- human handoff queue
- institution tenancy
- role-based access control
- quality and safety evaluation pipeline

## Recommended stack

- Backend: TypeScript on Node.js
- Frontend: Next.js or React admin app after package tooling is repaired
- Database: PostgreSQL
- Cache/stream buffer: Redis
- Infra: Docker Compose for local development, cloud containers for deployment

## Innovative features to prioritize

- uncertainty-aware response policy with graded fallback behavior
- code-switch-aware prompting and slot extraction
- domain-specific goal graphs rather than free-form chat
- conversation summaries for human handoff
- institution-level analytics for missed intents, latency, and task success
