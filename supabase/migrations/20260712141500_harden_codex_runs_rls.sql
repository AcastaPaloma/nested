drop policy if exists "Users can create their own Codex runs" on public.codex_runs;
create policy "Users can create their own Codex runs"
on public.codex_runs for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
  and (
    message_id is null
    or exists (
      select 1 from public.messages m
      where m.id = message_id and m.conversation_id = conversation_id
    )
  )
);

drop policy if exists "Users can update their own Codex runs" on public.codex_runs;
create policy "Users can update their own Codex runs"
on public.codex_runs for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
  and (
    message_id is null
    or exists (
      select 1 from public.messages m
      where m.id = message_id and m.conversation_id = conversation_id
    )
  )
);
