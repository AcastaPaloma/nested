create extension if not exists pgcrypto;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  parent_id uuid references public.messages(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  model text,
  provider text,
  created_at timestamptz not null default now()
);

create table public.message_references (
  id uuid primary key default gen_random_uuid(),
  source_message_id uuid not null references public.messages(id) on delete cascade,
  target_message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_message_id, target_message_id)
);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

create table public.node_positions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  x double precision not null,
  y double precision not null,
  width double precision,
  height double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, message_id)
);

create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index message_references_target_idx on public.message_references (target_message_id);
create index node_positions_conversation_idx on public.node_positions (conversation_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger node_positions_set_updated_at
before update on public.node_positions
for each row execute function public.set_updated_at();

create function public.get_message_ancestry(message_id uuid)
returns setof public.messages
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive ancestry as (
    select m.*, 0 as depth
    from public.messages m
    where m.id = $1
    union all
    select parent.*, ancestry.depth + 1
    from public.messages parent
    join ancestry on ancestry.parent_id = parent.id
  )
  select id, conversation_id, parent_id, role, content, model, provider, created_at
  from ancestry
  order by depth desc;
$$;

create function public.get_message_descendants(message_id uuid)
returns setof public.messages
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive descendants as (
    select m.* from public.messages m where m.id = $1
    union all
    select child.*
    from public.messages child
    join descendants on child.parent_id = descendants.id
  )
  select * from descendants order by created_at;
$$;

create function public.get_root_message_id(message_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive ancestry as (
    select m.id, m.parent_id, 0 as depth from public.messages m where m.id = $1
    union all
    select parent.id, parent.parent_id, ancestry.depth + 1
    from public.messages parent
    join ancestry on ancestry.parent_id = parent.id
  )
  select id from ancestry order by depth desc limit 1;
$$;

create function public.get_tree_messages(root_id uuid)
returns setof public.messages
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive tree as (
    select m.* from public.messages m where m.id = $1
    union all
    select child.*
    from public.messages child
    join tree on child.parent_id = tree.id
  )
  select * from tree order by created_at;
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_references enable row level security;
alter table public.message_attachments enable row level security;
alter table public.node_positions enable row level security;

create policy conversations_owner_all on public.conversations
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy messages_owner_all on public.messages
for all to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = messages.conversation_id and c.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.conversations c
  where c.id = messages.conversation_id and c.user_id = (select auth.uid())
));

create policy message_references_owner_all on public.message_references
for all to authenticated
using (exists (
  select 1
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = message_references.source_message_id and c.user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.messages source
  join public.messages target on target.id = message_references.target_message_id
  join public.conversations source_conversation on source_conversation.id = source.conversation_id
  where source.id = message_references.source_message_id
    and source_conversation.user_id = (select auth.uid())
    and target.conversation_id = source.conversation_id
));

create policy message_attachments_owner_all on public.message_attachments
for all to authenticated
using (exists (
  select 1 from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = message_attachments.message_id and c.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = message_attachments.message_id and c.user_id = (select auth.uid())
));

create policy node_positions_owner_all on public.node_positions
for all to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = node_positions.conversation_id and c.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = node_positions.message_id
    and m.conversation_id = node_positions.conversation_id
    and c.user_id = (select auth.uid())
));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.get_message_ancestry(uuid) to authenticated;
grant execute on function public.get_message_descendants(uuid) to authenticated;
grant execute on function public.get_root_message_id(uuid) to authenticated;
grant execute on function public.get_tree_messages(uuid) to authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.get_message_ancestry(uuid) from public, anon;
revoke execute on function public.get_message_descendants(uuid) from public, anon;
revoke execute on function public.get_root_message_id(uuid) from public, anon;
revoke execute on function public.get_tree_messages(uuid) from public, anon;

alter publication supabase_realtime add table public.messages;
