create extension if not exists pgcrypto;

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  position double precision not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id uuid not null references public.columns(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  label text not null default '',
  due_date date,
  responsible text not null default '',
  position double precision not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_activity (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  card_id uuid references public.cards(id) on delete set null,
  card_title text not null,
  from_column_id uuid references public.columns(id) on delete set null,
  from_column_title text,
  to_column_id uuid references public.columns(id) on delete set null,
  to_column_title text not null,
  created_at timestamptz not null default now()
);

alter table public.columns
  alter column position type double precision using position::double precision;

alter table public.cards
  alter column position type double precision using position::double precision;

alter table public.cards
  add column if not exists label text not null default '';

alter table public.cards
  add column if not exists due_date date;

alter table public.cards
  add column if not exists responsible text not null default '';

alter table public.card_activity
  alter column card_id drop not null;

alter table public.card_activity
  alter column to_column_id drop not null;

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join unnest(con.conkey) with ordinality as key(attnum, ord) on true
  join pg_attribute attr on attr.attrelid = rel.oid and attr.attnum = key.attnum
  where nsp.nspname = 'public'
    and rel.relname = 'card_activity'
    and con.contype = 'f'
    and attr.attname = 'card_id'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.card_activity drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.card_activity
  add constraint card_activity_card_id_fkey
  foreign key (card_id) references public.cards(id) on delete set null;

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join unnest(con.conkey) with ordinality as key(attnum, ord) on true
  join pg_attribute attr on attr.attrelid = rel.oid and attr.attnum = key.attnum
  where nsp.nspname = 'public'
    and rel.relname = 'card_activity'
    and con.contype = 'f'
    and attr.attname = 'to_column_id'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.card_activity drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.card_activity
  add constraint card_activity_to_column_id_fkey
  foreign key (to_column_id) references public.columns(id) on delete set null;

create index if not exists boards_owner_id_idx on public.boards(owner_id);
create index if not exists columns_board_id_position_idx on public.columns(board_id, position);
create index if not exists cards_board_column_position_idx on public.cards(board_id, column_id, position);
create index if not exists card_activity_board_created_idx on public.card_activity(board_id, created_at desc);

grant usage on schema public to anon, authenticated;
grant all on public.boards, public.columns, public.cards, public.card_activity to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at
before update on public.boards
for each row execute function public.set_updated_at();

drop trigger if exists columns_set_updated_at on public.columns;
create trigger columns_set_updated_at
before update on public.columns
for each row execute function public.set_updated_at();

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at
before update on public.cards
for each row execute function public.set_updated_at();

create or replace function public.ensure_card_column_matches_board()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.columns c
    where c.id = new.column_id
      and c.board_id = new.board_id
  ) then
    raise exception 'Card column must belong to the same board as the card.';
  end if;

  return new;
end;
$$;

drop trigger if exists cards_column_board_guard on public.cards;
create trigger cards_column_board_guard
before insert or update of board_id, column_id on public.cards
for each row execute function public.ensure_card_column_matches_board();

alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.cards enable row level security;
alter table public.card_activity enable row level security;

drop policy if exists "Users can read their own boards" on public.boards;
create policy "Users can read their own boards"
on public.boards for select
using (owner_id = auth.uid());

drop policy if exists "Users can create their own boards" on public.boards;
create policy "Users can create their own boards"
on public.boards for insert
with check (owner_id = auth.uid());

drop policy if exists "Users can update their own boards" on public.boards;
create policy "Users can update their own boards"
on public.boards for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Users can delete their own boards" on public.boards;
create policy "Users can delete their own boards"
on public.boards for delete
using (owner_id = auth.uid());

drop policy if exists "Users can read columns on owned boards" on public.columns;
create policy "Users can read columns on owned boards"
on public.columns for select
using (
  exists (
    select 1
    from public.boards b
    where b.id = columns.board_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can create columns on owned boards" on public.columns;
create policy "Users can create columns on owned boards"
on public.columns for insert
with check (
  exists (
    select 1
    from public.boards b
    where b.id = columns.board_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can update columns on owned boards" on public.columns;
create policy "Users can update columns on owned boards"
on public.columns for update
using (
  exists (
    select 1
    from public.boards b
    where b.id = columns.board_id
      and b.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.boards b
    where b.id = columns.board_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can delete columns on owned boards" on public.columns;
create policy "Users can delete columns on owned boards"
on public.columns for delete
using (
  exists (
    select 1
    from public.boards b
    where b.id = columns.board_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can read cards on owned boards" on public.cards;
create policy "Users can read cards on owned boards"
on public.cards for select
using (
  exists (
    select 1
    from public.boards b
    where b.id = cards.board_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can create cards on owned boards" on public.cards;
create policy "Users can create cards on owned boards"
on public.cards for insert
with check (
  exists (
    select 1
    from public.boards b
    join public.columns c on c.board_id = b.id
    where b.id = cards.board_id
      and c.id = cards.column_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can update cards on owned boards" on public.cards;
create policy "Users can update cards on owned boards"
on public.cards for update
using (
  exists (
    select 1
    from public.boards b
    where b.id = cards.board_id
      and b.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.boards b
    join public.columns c on c.board_id = b.id
    where b.id = cards.board_id
      and c.id = cards.column_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can delete cards on owned boards" on public.cards;
create policy "Users can delete cards on owned boards"
on public.cards for delete
using (
  exists (
    select 1
    from public.boards b
    where b.id = cards.board_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can read activity on owned boards" on public.card_activity;
create policy "Users can read activity on owned boards"
on public.card_activity for select
using (
  exists (
    select 1
    from public.boards b
    where b.id = card_activity.board_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can create activity on owned boards" on public.card_activity;
create policy "Users can create activity on owned boards"
on public.card_activity for insert
with check (
  exists (
    select 1
    from public.boards b
    join public.cards card on card.board_id = b.id
    join public.columns target_column on target_column.board_id = b.id
    where b.id = card_activity.board_id
      and card.id = card_activity.card_id
      and target_column.id = card_activity.to_column_id
      and b.owner_id = auth.uid()
      and (
        card_activity.from_column_id is null
        or exists (
          select 1
          from public.columns source_column
          where source_column.id = card_activity.from_column_id
            and source_column.board_id = b.id
        )
      )
  )
);
