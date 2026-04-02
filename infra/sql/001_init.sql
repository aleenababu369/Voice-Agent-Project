create table if not exists call_sessions (
  id uuid primary key,
  tenant_id text not null,
  domain text not null,
  workflow text not null,
  agent_profile_id text,
  status text not null,
  language text not null,
  phone_number text not null,
  display_name text,
  consent_captured boolean not null default false,
  slot_state jsonb not null default '{"required":[],"collected":{},"missing":[]}'::jsonb,
  follow_up jsonb not null default '{"status":"new"}'::jsonb,
  turn_count integer not null default 0,
  last_transcript text,
  escalation_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists call_metrics (
  id bigserial primary key,
  session_id uuid not null references call_sessions(id) on delete cascade,
  turn_switch_latency_ms integer not null,
  asr_confidence numeric(5,4) not null,
  nlu_confidence numeric(5,4) not null,
  workflow_completed boolean not null default false,
  escalated boolean not null default false,
  recorded_at timestamptz not null default now()
);

create table if not exists call_events (
  id bigserial primary key,
  session_id uuid not null references call_sessions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_call_sessions_tenant_id on call_sessions(tenant_id);
create index if not exists idx_call_metrics_session_id on call_metrics(session_id);
create index if not exists idx_call_events_session_id on call_events(session_id);
