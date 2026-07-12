create table if not exists public.codex_runs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid unique references public.messages(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id text,
  turn_id text,
  parent_run_id uuid references public.codex_runs(id) on delete set null,
  model text not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'failed', 'interrupted')),
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists codex_runs_parent_run_id_idx
  on public.codex_runs (parent_run_id);
create index if not exists codex_runs_thread_id_idx
  on public.codex_runs (thread_id)
  where thread_id is not null;
create index if not exists codex_runs_conversation_id_idx
  on public.codex_runs (conversation_id);
create index if not exists codex_runs_user_id_idx
  on public.codex_runs (user_id);
create index if not exists messages_conversation_id_id_idx
  on public.messages (conversation_id, id);
create index if not exists messages_conversation_id_parent_id_idx
  on public.messages (conversation_id, parent_id);

alter table public.codex_runs enable row level security;

create policy "Users can read their own Codex runs"
on public.codex_runs for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
);

create policy "Users can create their own Codex runs"
on public.codex_runs for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  and (
    message_id is null
    or exists (
      select 1 from public.messages m
      where m.id = message_id and m.conversation_id = conversation_id
    )
  )
);

create policy "Users can update their own Codex runs"
on public.codex_runs for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  and (
    message_id is null
    or exists (
      select 1 from public.messages m
      where m.id = message_id and m.conversation_id = conversation_id
    )
  )
);

create policy "Users can delete their own Codex runs"
on public.codex_runs for delete
to authenticated
using (
  user_id = (select auth.uid())
);

grant select, insert, update, delete on public.codex_runs to authenticated;

create or replace function public.claim_codex_run(
  assistant_message_id uuid,
  selected_model text
)
returns table (
  run_id uuid,
  parent_run_id uuid,
  parent_thread_id text,
  parent_turn_id text,
  should_fork boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_message_id uuid;
  v_conversation_id uuid;
  v_parent_assistant_id uuid;
  v_parent_run public.codex_runs%rowtype;
  v_run_id uuid;
  v_should_fork boolean := false;
begin
  select m.parent_id, m.conversation_id
    into v_user_message_id, v_conversation_id
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = assistant_message_id
    and m.role = 'assistant'
    and c.user_id = (select auth.uid())
  for update of m;

  if v_user_message_id is null then
    raise exception 'Assistant message not found or not authorized';
  end if;

  select m.parent_id
    into v_parent_assistant_id
  from public.messages m
  where m.id = v_user_message_id
    and m.role = 'user';

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(coalesce(v_parent_assistant_id, assistant_message_id)::text, 0)
  );

  if v_parent_assistant_id is not null then
    select r.* into v_parent_run
    from public.codex_runs r
    where r.message_id = v_parent_assistant_id;

    if v_parent_run.id is not null then
      select exists (
        select 1 from public.codex_runs child where child.parent_run_id = v_parent_run.id
      ) into v_should_fork;
    end if;
  end if;

  insert into public.codex_runs (message_id, conversation_id, user_id, parent_run_id, model, status)
  values (assistant_message_id, v_conversation_id, (select auth.uid()), v_parent_run.id, selected_model, 'pending')
  returning id into v_run_id;

  return query select
    v_run_id,
    v_parent_run.id,
    v_parent_run.thread_id,
    v_parent_run.turn_id,
    v_should_fork;
end;
$$;

revoke all on function public.claim_codex_run(uuid, text) from public;
grant execute on function public.claim_codex_run(uuid, text) to authenticated;
