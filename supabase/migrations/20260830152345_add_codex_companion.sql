create table public.codex_companions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  name text not null default 'Local Codex' check (char_length(name) between 1 and 80),
  authenticated boolean not null default false,
  account_type text,
  email text,
  plan_type text,
  models jsonb not null default '[]'::jsonb check (jsonb_typeof(models) = 'array'),
  rate_limits jsonb not null default '[]'::jsonb check (jsonb_typeof(rate_limits) = 'array'),
  last_error text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.codex_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.codex_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assistant_message_id uuid not null unique references public.messages(id) on delete cascade,
  user_message_id uuid not null references public.messages(id) on delete cascade,
  companion_id uuid references public.codex_companions(id) on delete set null,
  model text not null,
  prompt text not null,
  action jsonb not null check (jsonb_typeof(action) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'in_progress', 'completed', 'failed', 'interrupted')),
  output_text text not null default '',
  thread_id text,
  turn_id text,
  cancel_requested boolean not null default false,
  error_details jsonb,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index codex_companions_last_seen_idx
  on public.codex_companions (last_seen_at desc)
  where last_seen_at is not null;
create index codex_jobs_user_status_created_idx
  on public.codex_jobs (user_id, status, created_at);
create index codex_jobs_companion_status_idx
  on public.codex_jobs (companion_id, status)
  where companion_id is not null;

create trigger codex_companions_set_updated_at
before update on public.codex_companions
for each row execute function public.set_updated_at();

create trigger codex_jobs_set_updated_at
before update on public.codex_jobs
for each row execute function public.set_updated_at();

alter table public.codex_companions enable row level security;
alter table public.codex_jobs enable row level security;

revoke all on table public.codex_companions from anon, authenticated;
revoke all on table public.codex_jobs from anon, authenticated;
grant insert, update, delete on table public.codex_companions to authenticated;
grant select (
  id, user_id, name, authenticated, account_type, email, plan_type, models,
  rate_limits, last_error, last_seen_at, created_at, updated_at
) on table public.codex_companions to authenticated;
grant select on table public.codex_jobs to authenticated;
grant select, insert, update, delete on table public.codex_companions to service_role;
grant select, insert, update, delete on table public.codex_jobs to service_role;

create policy "Users can read their own Codex companion"
on public.codex_companions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can pair their own Codex companion"
on public.codex_companions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can rotate their own Codex companion"
on public.codex_companions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can revoke their own Codex companion"
on public.codex_companions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own Codex jobs"
on public.codex_jobs for select
to authenticated
using ((select auth.uid()) = user_id);
