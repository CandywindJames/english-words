-- english-words：新项目初始化。通过独立英文词库和按用户隔离的事件保存学习历史。
create table if not exists public.vocab_words (
  id text primary key,
  word text not null,
  meaning text not null,
  frequency integer,
  source_page integer not null
);
alter table public.vocab_words enable row level security;
create policy "Anyone can read vocabulary" on public.vocab_words for select to anon, authenticated using (true);
revoke all on public.vocab_words from anon, authenticated;
grant select on public.vocab_words to anon, authenticated;

create table if not exists public.vocab_events (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id text not null references public.vocab_words(id),
  kind text not null check (kind in ('choice','match','master','unmaster')),
  correct boolean,
  answer text check (length(answer) <= 2000),
  created_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (user_id, id),
  check ((kind in ('choice','match') and correct is not null) or (kind in ('master','unmaster') and correct is null))
);
create index vocab_events_owner_time on public.vocab_events (user_id, created_at, id);
create index vocab_events_word on public.vocab_events (word_id);
alter table public.vocab_events enable row level security;
create policy "Read own learning events" on public.vocab_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own learning events" on public.vocab_events for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.vocab_events from anon, authenticated;
grant select, insert on public.vocab_events to authenticated;
comment on table public.vocab_events is 'Append-only learning events. UUID deduplication makes retry and multi-device synchronization safe.';

-- v2: personal additions and reversible removals. Existing learning history is retained.
create table public.vocab_catalog_events (
 id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 word_id text not null check(length(word_id) between 1 and 200),
 kind text not null check(kind in ('add','delete','restore')),
 word text,
 meaning text,
 frequency integer check(frequency between 0 and 100000),
 tags text[] not null default '{}' check(cardinality(tags)<=20 and octet_length(tags::text)<=3000),
 created_at timestamptz not null,
 received_at timestamptz not null default now(),
 primary key(user_id,id),
 check(kind<>'add' or (word_id ~ '^custom:[0-9a-fA-F-]{36}$' and length(trim(word)) between 1 and 100 and length(trim(meaning)) between 1 and 2000 and word is not null and meaning is not null)),
 check(kind='add' or (word is null and meaning is null and frequency is null and cardinality(tags)=0))
);
create index vocab_catalog_owner_time on public.vocab_catalog_events(user_id,created_at,id);
alter table public.vocab_catalog_events enable row level security;
create policy "Read own vocabulary changes" on public.vocab_catalog_events for select to authenticated using((select auth.uid())=user_id);
create policy "Add own vocabulary changes" on public.vocab_catalog_events for insert to authenticated with check(
 (select auth.uid())=user_id and
 (kind='add' or exists(select 1 from public.vocab_words w where w.id=word_id) or word_id ~ '^custom:[0-9a-fA-F-]{36}$')
);
revoke all on public.vocab_catalog_events from anon,authenticated;
grant select,insert on public.vocab_catalog_events to authenticated;
alter table public.vocab_events drop constraint if exists vocab_events_word_id_fkey;
drop policy "Insert own learning events" on public.vocab_events;
create policy "Insert own learning events" on public.vocab_events for insert to authenticated with check(
 (select auth.uid())=user_id and
 (exists(select 1 from public.vocab_words w where w.id=word_id) or exists(select 1 from public.vocab_catalog_events c where c.user_id=(select auth.uid()) and c.kind='add' and c.word_id=vocab_events.word_id))
);
comment on table public.vocab_catalog_events is 'Personal additions and reversible delete/restore events. Shared PDF vocabulary is unchanged.';
