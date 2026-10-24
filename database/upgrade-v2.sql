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
