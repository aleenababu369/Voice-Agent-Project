-- Accounts, prospects, and campaigns. Additive to 001_init.sql; safe to re-run.

create table if not exists accounts (
  id text primary key,
  name text not null,
  email text unique not null,
  use_case text,
  password_hash text not null,
  password_salt text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists prospects (
  id text primary key,
  tenant_id text not null,
  name text not null,
  phone_number text not null,
  email text,
  fields jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  campaign_id text,
  last_session_id uuid,
  last_outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  id text primary key,
  tenant_id text not null,
  name text not null,
  direction text not null,
  status text not null default 'draft',
  agent_profile_id text not null,
  prospect_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table call_sessions add column if not exists prospect_id text;
alter table call_sessions add column if not exists campaign_id text;
alter table operations add column if not exists prospect_id text;
alter table operations add column if not exists campaign_id text;

create index if not exists idx_prospects_tenant_id on prospects(tenant_id);
create index if not exists idx_prospects_campaign_id on prospects(campaign_id);
create index if not exists idx_campaigns_tenant_id on campaigns(tenant_id);
