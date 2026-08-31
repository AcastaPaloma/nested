alter table public.codex_jobs
  add column kind text not null default 'turn'
    check (kind in ('turn', 'archive')),
  alter column run_id drop not null,
  alter column assistant_message_id drop not null,
  alter column user_message_id drop not null,
  alter column model drop not null,
  alter column prompt drop not null,
  alter column action drop not null;

create unique index codex_jobs_archive_thread_unique
  on public.codex_jobs (user_id, thread_id)
  where kind = 'archive';

alter table public.codex_jobs
  add constraint codex_jobs_payload_check check (
    (
      kind = 'turn'
      and run_id is not null
      and assistant_message_id is not null
      and user_message_id is not null
      and model is not null
      and prompt is not null
      and action is not null
    )
    or (
      kind = 'archive'
      and thread_id is not null
    )
  );
