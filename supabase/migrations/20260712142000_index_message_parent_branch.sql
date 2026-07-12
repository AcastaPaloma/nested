create index if not exists messages_conversation_id_parent_id_idx
  on public.messages (conversation_id, parent_id);
