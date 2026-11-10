-- Genie v2 initial schema. See docs/architecture.md section 5.
-- Three tables: users (people), prototypes (current state), events (everything that happened).
-- Only the Next.js server and the worker (secret key) access the database.

-- Types ---------------------------------------------------------------------

create type prototype_status as enum (
  'recording',           -- user is recording or re-recording
  'requirements_ready',  -- requirements generated, user can request changes, approve or decline
  'pending_review',      -- user approved; waiting for an admin ("Pending approval" in the UI)
  'user_declined',       -- user declined the requirements; quota used
  'approved',            -- admin accepted; waiting for the worker (also used for rebuilds)
  'building',            -- worker is building
  'build_failed',        -- build failed after the automatic retry
  'awaiting_qa',         -- built; admin checks the private preview
  'released',            -- live, link emailed to the user
  'expired',             -- 3 days after release
  'declined',            -- admin declined at review or at QA
  'offline'              -- taken offline by an admin
);

create type actor_role as enum ('user', 'admin', 'system');

-- users ---------------------------------------------------------------------

create table users (
  id               uuid primary key default gen_random_uuid(),
  clerk_user_id    text unique,                       -- null after the Clerk account is deleted
  email            text not null,
  email_normalized text not null unique,              -- quota key (BR-1 to BR-3)
  role             text not null default 'user'
                     check (role in ('user', 'admin')), -- copy of Clerk's role, display only
  signup_ip        inet,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz                        -- row kept so the used quota survives
);

-- prototypes ----------------------------------------------------------------

create table prototypes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references users (id),  -- one per user in Phase 1
  slug                  text unique,                                 -- e.g. invoice-approvals-k3x9
  title                 text,

  status                prototype_status not null default 'recording',
  status_changed_at     timestamptz not null default now(),

  -- recording (audio files live in Storage: audio/{id}/{n}.wav)
  audio_chunk_count     int not null default 0 check (audio_chunk_count >= 0),
  recording_duration_ms int check (recording_duration_ms >= 0),
  transcript            text,
  recording_locked_at   timestamptz,                                 -- set when Generate is pressed (BR-5)

  -- requirements (every version is also stored in events)
  requirements          jsonb,                                       -- current version
  revision_count        int not null default 0
                          check (revision_count between 0 and 2),    -- change requests used (BR-4)
  submitted_at          timestamptz,                                 -- requirements locked (BR-14)
  ip_flagged            boolean not null default false,              -- BR-7
  user_decline_reason   text,

  -- admin decision at review or QA
  reviewed_by           uuid references users (id),
  reviewed_at           timestamptz,
  decision_category     text check (decision_category in ('unclear', 'out_of_scope', 'abusive', 'duplicate')),
  decision_reason       text,                                        -- shown to the user

  -- build (the worker queue is rows with status 'approved')
  build_attempts        int not null default 0 check (build_attempts >= 0),
  build_note            text,                                        -- admin's defect note for a QA rebuild
  build_claimed_by      text,
  build_heartbeat_at    timestamptz,
  build_cost_usd        numeric(10, 4) not null default 0,           -- total across attempts
  source_path           text,                                        -- sources/{id}.tar.gz
  site_path             text,                                        -- sites/{id}.tar.gz

  -- delivery
  site_url              text,
  released_by           uuid references users (id),
  released_at           timestamptz,
  expires_at            timestamptz,                                 -- released_at + 3 days (BR-12)

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index prototypes_status_idx on prototypes (status, status_changed_at);

-- Keeps updated_at current on every change
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger prototypes_set_updated_at
  before update on prototypes
  for each row execute function set_updated_at();

-- events --------------------------------------------------------------------

create table events (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor_id     uuid references users (id),        -- who did it (null = system)
  actor_role   actor_role not null,               -- role at the time of the action
  user_id      uuid references users (id),        -- whose account it concerns
  prototype_id uuid references prototypes (id),   -- null for account-level events
  action       text not null,                     -- see the event catalogue, architecture 5.4
  from_status  prototype_status,                  -- only for status changes
  to_status    prototype_status,
  ip           inet,
  reason       text,
  details      jsonb
);

create index events_prototype_idx on events (prototype_id, created_at);
create index events_user_idx on events (user_id, created_at);
create index events_ip_idx on events (ip) where ip is not null;

-- Access --------------------------------------------------------------------
-- Row level security on, with no policies: the public (anon) and signed-in
-- (authenticated) Supabase roles can read and write nothing. The app and the
-- worker connect as the database owner or with the secret key, which bypass RLS.

alter table users enable row level security;
alter table prototypes enable row level security;
alter table events enable row level security;

revoke all on users, prototypes, events from anon, authenticated;
revoke all on function set_updated_at() from anon, authenticated;

-- Storage buckets (all private) -----------------------------------------------
-- audio/{prototype_id}/{n}.wav, sources/{prototype_id}.tar.gz,
-- sites/{prototype_id}.tar.gz, logs/{prototype_id}/{attempt}.jsonl

insert into storage.buckets (id, name, public)
values
  ('audio', 'audio', false),
  ('sources', 'sources', false),
  ('sites', 'sites', false),
  ('logs', 'logs', false)
on conflict (id) do nothing;
