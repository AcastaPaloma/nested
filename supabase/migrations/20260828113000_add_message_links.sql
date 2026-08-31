-- A deliberate, durable connection between two thoughts on a board. Unlike
-- message_references (the context snapshot attached to a sent prompt), links
-- remain editable and can be used to prepare context for a future branch.
create table public.message_links (
  id uuid primary key default gen_random_uuid(),
  source_message_id uuid not null references public.messages(id) on delete cascade,
  target_message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_message_id, target_message_id),
  check (source_message_id <> target_message_id)
);

-- Find searches message text across a user's boards. Trigram indexing keeps
-- substring search responsive as a personal knowledge map grows.
create extension if not exists pg_trgm;
create index messages_content_trgm_idx
  on public.messages using gin (content gin_trgm_ops);

create index message_links_source_idx on public.message_links (source_message_id);
create index message_links_target_idx on public.message_links (target_message_id);

alter table public.message_links enable row level security;

create policy message_links_owner_all on public.message_links
for all to authenticated
using (
  exists (
    select 1
    from public.messages source
    join public.conversations conversation on conversation.id = source.conversation_id
    where source.id = message_links.source_message_id
      and conversation.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.messages source
    join public.messages target on target.id = message_links.target_message_id
    join public.conversations conversation on conversation.id = source.conversation_id
    where source.id = message_links.source_message_id
      and source.conversation_id = target.conversation_id
      and conversation.user_id = (select auth.uid())
  )
);

grant select, insert, delete on public.message_links to authenticated;
